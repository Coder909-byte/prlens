import { loadPrompt, DIFF_ONLY_PROMPT_VERSION, REPO_AWARE_PROMPT_VERSION } from "@prlens/reviewer";
import { cacheKey, hashPromptText, readCache, type CacheEntry } from "./cache.js";
import { loadPairsForSplit, getSplitNote } from "./splits.js";
import { scoreFindings, aggregate, aggregateByRepo, type PairScore } from "./scoring.js";
import { writeReport } from "./report.js";
import type { MinedPair, SplitName } from "./types.js";

interface ModeRun {
  entry: CacheEntry;
  score: PairScore;
}

function loadModeRun(pair: MinedPair, mode: "diff-only" | "repo-aware", provider: string, model: string): ModeRun | null {
  const promptVersion = mode === "repo-aware" ? REPO_AWARE_PROMPT_VERSION : DIFF_ONLY_PROMPT_VERSION;
  const promptHash = hashPromptText(loadPrompt(promptVersion));
  const key = cacheKey({ repo: pair.repo, prNumber: pair.buggyPr.number, headSha: pair.buggyPr.headSha, mode, provider, model, promptHash });
  const entry = readCache(key);
  if (!entry) return null;
  const { caught, falsePositives } = scoreFindings(pair, entry.findings);
  return {
    entry,
    score: {
      pairId: pair.id,
      repo: pair.repo,
      caught,
      falsePositives,
      latencyMs: entry.latencyMs,
      costUsd: entry.costUsd,
      inputTokens: entry.inputTokens,
      outputTokens: entry.outputTokens,
      failed: entry.failed,
    },
  };
}

function fmtPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}
function fmtCost(n: number | null): string {
  return n === null ? "n/a" : `$${n.toFixed(5)}`;
}

/**
 * For every pair where the two modes disagree on "caught," reports whether
 * repo-aware's retrieval actually surfaced relevant context - the
 * distinction the comparison exists to answer: a miss with rich retrieved
 * context is the model choosing not to flag it; a miss with nothing
 * retrieved is retrieval failing to surface the relevant code at all.
 */
function describeDivergence(pairId: string, diffOnly: ModeRun | null, repoAware: ModeRun | null): string {
  const diffCaught = diffOnly?.score.caught ?? false;
  const awareCaught = repoAware?.score.caught ?? false;
  if (diffCaught === awareCaught) return "";

  const contexts = (repoAware?.entry.retrievedContext ?? []) as { changedSymbol: unknown; items: unknown[] }[];
  const hunksWithSymbol = contexts.filter((c) => c.changedSymbol).length;
  const totalItems = contexts.reduce((sum, c) => sum + (c.items?.length ?? 0), 0);
  const retrievalSurfacedContext = hunksWithSymbol > 0 && totalItems > 0;

  if (diffCaught && !awareCaught) {
    return retrievalSurfacedContext
      ? `**${pairId}**: diff-only caught it, repo-aware missed it. Retrieval DID surface relevant context (${totalItems} items across ${hunksWithSymbol} hunk(s)) - this is the model seeing context and staying quiet, not a retrieval gap.`
      : `**${pairId}**: diff-only caught it, repo-aware missed it. Retrieval found NOTHING relevant (no changed symbol matched, or zero items) - this miss may be a retrieval gap, not a model judgment call.`;
  }
  return retrievalSurfacedContext
    ? `**${pairId}**: repo-aware caught it, diff-only didn't. Retrieval surfaced ${totalItems} relevant item(s) - plausibly what tipped the finding.`
    : `**${pairId}**: repo-aware caught it, diff-only didn't, despite retrieval surfacing little or no context - likely model variance rather than retrieval helping.`;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const splitIndex = args.indexOf("--split");
  const providerIndex = args.indexOf("--provider");
  const modelIndex = args.indexOf("--model");
  const split = (splitIndex !== -1 ? args[splitIndex + 1] : undefined) as SplitName | undefined;
  const provider = providerIndex !== -1 ? args[providerIndex + 1] : undefined;
  const model: string = (modelIndex !== -1 ? args[modelIndex + 1] : undefined) ?? "default";

  if (split !== "dev" && split !== "test") throw new Error('--split is required ("dev" or "test")');
  if (!provider) throw new Error("--provider is required (must match the provider both eval runs used)");
  const resolvedProvider: string = provider;

  const pairs = loadPairsForSplit(split);
  const runs = pairs.map((pair) => ({
    pair,
    diffOnly: loadModeRun(pair, "diff-only", resolvedProvider, model),
    repoAware: loadModeRun(pair, "repo-aware", resolvedProvider, model),
  }));

  const missingDiffOnly = runs.filter((r) => !r.diffOnly);
  const missingRepoAware = runs.filter((r) => !r.repoAware);
  if (missingDiffOnly.length > 0 || missingRepoAware.length > 0) {
    console.error(
      `[compare] missing cache entries - run both modes over --split ${split} first. diff-only missing: ${missingDiffOnly.map((r) => r.pair.id).join(", ") || "none"}; repo-aware missing: ${missingRepoAware.map((r) => r.pair.id).join(", ") || "none"}`,
    );
    process.exit(1);
  }

  const diffOnlyScores = runs.map((r) => r.diffOnly!.score);
  const repoAwareScores = runs.map((r) => r.repoAware!.score);
  const diffOnlyAgg = aggregate(diffOnlyScores);
  const repoAwareAgg = aggregate(repoAwareScores);
  const diffOnlyByRepo = aggregateByRepo(diffOnlyScores);
  const repoAwareByRepo = aggregateByRepo(repoAwareScores);

  const avgExtraInputTokens = repoAwareScores.reduce((sum, s) => sum + s.inputTokens, 0) / repoAwareScores.length - diffOnlyScores.reduce((sum, s) => sum + s.inputTokens, 0) / diffOnlyScores.length;
  const extraCost = (repoAwareAgg.totalCostUsd ?? 0) - (diffOnlyAgg.totalCostUsd ?? 0);

  const lines: string[] = [];
  lines.push("# Eval comparison — diff-only vs. repo-aware");
  lines.push("");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Provider: ${provider} · model: ${model}`);
  lines.push("");
  lines.push(`> **Note on dataset size**: ${getSplitNote()}`);
  lines.push("");
  lines.push("## Overall");
  lines.push("");
  lines.push("| Mode | Pairs | Recall | FP/PR | Avg cost | Total cost | p50 latency | p95 latency |");
  lines.push("|---|---|---|---|---|---|---|---|");
  lines.push(`| diff-only | ${diffOnlyAgg.pairCount} | ${fmtPct(diffOnlyAgg.recall)} | ${diffOnlyAgg.fpPerPr.toFixed(2)} | ${fmtCost(diffOnlyAgg.avgCostUsd)} | ${fmtCost(diffOnlyAgg.totalCostUsd)} | ${diffOnlyAgg.p50LatencyMs}ms | ${diffOnlyAgg.p95LatencyMs}ms |`);
  lines.push(`| repo-aware | ${repoAwareAgg.pairCount} | ${fmtPct(repoAwareAgg.recall)} | ${repoAwareAgg.fpPerPr.toFixed(2)} | ${fmtCost(repoAwareAgg.avgCostUsd)} | ${fmtCost(repoAwareAgg.totalCostUsd)} | ${repoAwareAgg.p50LatencyMs}ms | ${repoAwareAgg.p95LatencyMs}ms |`);
  lines.push("");
  lines.push(`**Extra cost from repo context**: ~${avgExtraInputTokens.toFixed(0)} extra input tokens/review on average, ${fmtCost(extraCost)} extra total cost across the split.`);
  lines.push("");
  lines.push("## Per-repo breakdown");
  lines.push("");
  lines.push("| Repo | Mode | Pairs | Recall | FP/PR | Avg cost |");
  lines.push("|---|---|---|---|---|---|");
  for (const repo of [...new Set(pairs.map((p) => p.repo))].sort()) {
    const d = diffOnlyByRepo.get(repo)!;
    const r = repoAwareByRepo.get(repo)!;
    lines.push(`| ${repo} | diff-only | ${d.pairCount} | ${fmtPct(d.recall)} | ${d.fpPerPr.toFixed(2)} | ${fmtCost(d.avgCostUsd)} |`);
    lines.push(`| ${repo} | repo-aware | ${r.pairCount} | ${fmtPct(r.recall)} | ${r.fpPerPr.toFixed(2)} | ${fmtCost(r.avgCostUsd)} |`);
  }
  lines.push("");
  lines.push("## Divergences (where the two modes disagree)");
  lines.push("");
  const divergenceNotes = runs.map((r) => describeDivergence(r.pair.id, r.diffOnly, r.repoAware)).filter(Boolean);
  if (divergenceNotes.length === 0) {
    lines.push("None - both modes caught (or missed) exactly the same pairs.");
  } else {
    for (const note of divergenceNotes) lines.push(`- ${note}`);
  }
  lines.push("");

  const date = new Date().toISOString().slice(0, 10);
  const path = writeReport(`${date}-comparison-${split}.md`, lines.join("\n"));
  console.log(`[compare] report written to ${path}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
