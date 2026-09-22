import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadPairsForSplit, getSplitNote } from "./splits.js";
import { REPORTS_DIR } from "./report.js";
import type { EvalMode } from "./types.js";

interface RunRecord {
  pairId: string;
  repo: string;
  mode: EvalMode;
  rep: number;
  caught: boolean;
  falsePositives: number;
  failed: boolean;
  retrievedItemCount: number;
  costUsd: number | null;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
}

const RECORDS_PATH = join(dirname(fileURLToPath(import.meta.url)), "..", ".cache", "repeated-runs.json");

function fmtPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}
function fmtCost(n: number | null): string {
  return n === null ? "n/a" : `$${n.toFixed(5)}`;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)]!;
}

interface ModeAggregate {
  pairCount: number;
  recall: number;
  recallMin: number;
  recallMax: number;
  recallPerRun: number[];
  fpPerPr: number;
  avgCostUsd: number | null;
  totalCostUsd: number | null;
  p50LatencyMs: number;
  p95LatencyMs: number;
  failedCount: number;
}

function aggregateMode(records: RunRecord[], pairIds: string[], runsPerPair: number): ModeAggregate {
  const recallPerRun: number[] = [];
  for (let rep = 1; rep <= runsPerPair; rep++) {
    const repRecords = records.filter((r) => r.rep === rep);
    const caughtCount = repRecords.filter((r) => r.caught).length;
    recallPerRun.push(pairIds.length === 0 ? 0 : caughtCount / pairIds.length);
  }
  const totalFp = records.reduce((sum, r) => sum + r.falsePositives, 0);
  const costs = records.map((r) => r.costUsd).filter((c): c is number => c !== null);
  const latencies = records.map((r) => r.latencyMs).sort((a, b) => a - b);

  return {
    pairCount: pairIds.length,
    recall: recallPerRun.reduce((a, b) => a + b, 0) / recallPerRun.length,
    recallMin: Math.min(...recallPerRun),
    recallMax: Math.max(...recallPerRun),
    recallPerRun,
    fpPerPr: records.length === 0 ? 0 : totalFp / records.length,
    avgCostUsd: costs.length === 0 ? null : costs.reduce((a, b) => a + b, 0) / costs.length,
    totalCostUsd: costs.length === 0 ? null : costs.reduce((a, b) => a + b, 0),
    p50LatencyMs: percentile(latencies, 50),
    p95LatencyMs: percentile(latencies, 95),
    failedCount: records.filter((r) => r.failed).length,
  };
}

async function main(): Promise<void> {
  const split = "dev" as const;
  const pairs = loadPairsForSplit(split);
  const pairIds = pairs.map((p) => p.id);
  const runsPerPair = 5;

  const all: RunRecord[] = JSON.parse(readFileSync(RECORDS_PATH, "utf8"));

  const missing: string[] = [];
  for (const pairId of pairIds) {
    for (const mode of ["diff-only", "repo-aware"] as const) {
      for (let rep = 1; rep <= runsPerPair; rep++) {
        if (!all.some((r) => r.pairId === pairId && r.mode === mode && r.rep === rep)) {
          missing.push(`${pairId} ${mode} rep${rep}`);
        }
      }
    }
  }
  if (missing.length > 0) {
    console.error(`[aggregate-repeated] INCOMPLETE - ${missing.length} of ${pairIds.length * 2 * runsPerPair} calls missing:`);
    for (const m of missing) console.error(`  - ${m}`);
    process.exit(1);
  }

  const diffOnlyRecords = all.filter((r) => r.mode === "diff-only");
  const repoAwareRecords = all.filter((r) => r.mode === "repo-aware");
  const diffOnly = aggregateMode(diffOnlyRecords, pairIds, runsPerPair);
  const repoAware = aggregateMode(repoAwareRecords, pairIds, runsPerPair);

  const rangesOverlap = diffOnly.recallMin <= repoAware.recallMax && repoAware.recallMin <= diffOnly.recallMax;

  // Per-pair catch rate, out of runsPerPair, per mode.
  const pairRows = pairs.map((pair) => {
    const d = diffOnlyRecords.filter((r) => r.pairId === pair.id);
    const r = repoAwareRecords.filter((r) => r.pairId === pair.id);
    return {
      id: pair.id,
      repo: pair.repo,
      method: pair.method,
      confidence: pair.confidence,
      diffOnlyCatchCount: d.filter((x) => x.caught).length,
      repoAwareCatchCount: r.filter((x) => x.caught).length,
      runs: runsPerPair,
      diffOnlyCostUsd: d.reduce((s, x) => s + (x.costUsd ?? 0), 0) / d.length,
      diffOnlyLatencyMs: Math.round(d.reduce((s, x) => s + x.latencyMs, 0) / d.length),
      repoAwareCostUsd: r.reduce((s, x) => s + (x.costUsd ?? 0), 0) / r.length,
      repoAwareLatencyMs: Math.round(r.reduce((s, x) => s + x.latencyMs, 0) / r.length),
    };
  });

  // Confusion matrix over every (pair, rep) comparison, aligning diff-only
  // rep N against repo-aware rep N for the same pair - 55 comparisons at
  // runsPerPair=5, not 11 (the single-run version compared one boolean per
  // pair; this compares every rep independently, so a pair that's caught
  // 3/5 times by one mode and 5/5 by the other contributes to more than one
  // bucket across its 5 comparisons).
  let both = 0,
    diffOnlyOnly = 0,
    repoAwareOnly = 0,
    neither = 0;
  for (const pairId of pairIds) {
    for (let rep = 1; rep <= runsPerPair; rep++) {
      const d = diffOnlyRecords.find((r) => r.pairId === pairId && r.rep === rep)!.caught;
      const r = repoAwareRecords.find((r) => r.pairId === pairId && r.rep === rep)!.caught;
      if (d && r) both++;
      else if (d && !r) diffOnlyOnly++;
      else if (!d && r) repoAwareOnly++;
      else neither++;
    }
  }
  const confusionMatrix = { both, diffOnly: diffOnlyOnly, repoAwareOnly, neither, totalComparisons: pairIds.length * runsPerPair };

  // Re-check "retrieval surfaced context but the model stayed quiet" - the
  // README's headline claim from the single-run comparison, specifically
  // about psf/requests#3738. Only kept if it holds on a MAJORITY of the 5
  // repo-aware reps, not just the one run it was originally observed in -
  // the whole point of repeating runs is that a single observation isn't
  // enough to support a claim like this.
  const requestsPairId = pairIds.find((id) => id.startsWith("psf/requests"));
  let retrievalQuietModelNote: string | null = null;
  if (requestsPairId) {
    const reps = repoAwareRecords.filter((r) => r.pairId === requestsPairId);
    const withContext = reps.filter((r) => r.retrievedItemCount > 0);
    const withContextAndMissed = withContext.filter((r) => !r.caught).length;
    const holdsOnMajority = withContext.length > 0 && withContextAndMissed >= Math.ceil(reps.length / 2);
    retrievalQuietModelNote = holdsOnMajority
      ? `${requestsPairId}: retrieval surfaced context (retrievedItemCount > 0) in ${withContext.length}/${reps.length} repo-aware reps, and the model still missed the bug in ${withContextAndMissed}/${reps.length} - holds on a majority of runs, not just the one it was first observed in.`
      : null;
  }

  console.log("=== Repeated-run aggregate (n=" + pairIds.length + ", " + runsPerPair + " reps/mode) ===");
  console.log(`diff-only  recall: mean ${fmtPct(diffOnly.recall)}  range [${fmtPct(diffOnly.recallMin)}, ${fmtPct(diffOnly.recallMax)}]  per-run ${diffOnly.recallPerRun.map(fmtPct).join(", ")}`);
  console.log(`repo-aware recall: mean ${fmtPct(repoAware.recall)}  range [${fmtPct(repoAware.recallMin)}, ${fmtPct(repoAware.recallMax)}]  per-run ${repoAware.recallPerRun.map(fmtPct).join(", ")}`);
  console.log(`ranges overlap: ${rangesOverlap}`);
  console.log(`fpPerPr: diff-only ${diffOnly.fpPerPr.toFixed(2)}, repo-aware ${repoAware.fpPerPr.toFixed(2)}`);
  console.log(`avg cost: diff-only ${fmtCost(diffOnly.avgCostUsd)}, repo-aware ${fmtCost(repoAware.avgCostUsd)}`);
  console.log(`total cost (both modes, all reps): ${fmtCost((diffOnly.totalCostUsd ?? 0) + (repoAware.totalCostUsd ?? 0))}`);
  console.log(`confusion matrix (${confusionMatrix.totalComparisons} pair-rep comparisons): both=${both} diffOnlyOnly=${diffOnlyOnly} repoAwareOnly=${repoAwareOnly} neither=${neither}`);
  console.log("per-pair catch rate:");
  for (const p of pairRows) console.log(`  ${p.id}: diff-only ${p.diffOnlyCatchCount}/${p.runs}, repo-aware ${p.repoAwareCatchCount}/${p.runs}`);
  if (retrievalQuietModelNote) console.log(retrievalQuietModelNote);

  const avgExtraInputTokens = repoAwareRecords.reduce((s, r) => s + r.inputTokens, 0) / repoAwareRecords.length - diffOnlyRecords.reduce((s, r) => s + r.inputTokens, 0) / diffOnlyRecords.length;
  const extraCost = (repoAware.totalCostUsd ?? 0) - (diffOnly.totalCostUsd ?? 0);

  const jsonReport = {
    generatedAt: new Date().toISOString(),
    split,
    provider: "groq",
    model: "default",
    splitNote: getSplitNote(),
    overall: {
      diffOnly: { pairCount: diffOnly.pairCount, recall: diffOnly.recall, fpPerPr: diffOnly.fpPerPr, avgCostUsd: diffOnly.avgCostUsd, totalCostUsd: diffOnly.totalCostUsd, p50LatencyMs: diffOnly.p50LatencyMs, p95LatencyMs: diffOnly.p95LatencyMs, failedCount: diffOnly.failedCount },
      repoAware: { pairCount: repoAware.pairCount, recall: repoAware.recall, fpPerPr: repoAware.fpPerPr, avgCostUsd: repoAware.avgCostUsd, totalCostUsd: repoAware.totalCostUsd, p50LatencyMs: repoAware.p50LatencyMs, p95LatencyMs: repoAware.p95LatencyMs, failedCount: repoAware.failedCount },
      extraInputTokensAvg: avgExtraInputTokens,
      extraCostUsd: extraCost,
    },
    byRepo: Object.fromEntries(
      [...new Set(pairs.map((p) => p.repo))].sort().map((repo) => {
        const repoPairIds = pairs.filter((p) => p.repo === repo).map((p) => p.id);
        const d = aggregateMode(diffOnlyRecords.filter((r) => repoPairIds.includes(r.pairId)), repoPairIds, runsPerPair);
        const r = aggregateMode(repoAwareRecords.filter((r) => repoPairIds.includes(r.pairId)), repoPairIds, runsPerPair);
        return [
          repo,
          {
            diffOnly: { pairCount: d.pairCount, recall: d.recall, fpPerPr: d.fpPerPr, avgCostUsd: d.avgCostUsd, totalCostUsd: d.totalCostUsd, p50LatencyMs: d.p50LatencyMs, p95LatencyMs: d.p95LatencyMs, failedCount: d.failedCount },
            repoAware: { pairCount: r.pairCount, recall: r.recall, fpPerPr: r.fpPerPr, avgCostUsd: r.avgCostUsd, totalCostUsd: r.totalCostUsd, p50LatencyMs: r.p50LatencyMs, p95LatencyMs: r.p95LatencyMs, failedCount: r.failedCount },
          },
        ];
      }),
    ),
    repeated: {
      runsPerPair,
      diffOnly: { recallPerRun: diffOnly.recallPerRun, recallMean: diffOnly.recall, recallMin: diffOnly.recallMin, recallMax: diffOnly.recallMax },
      repoAware: { recallPerRun: repoAware.recallPerRun, recallMean: repoAware.recall, recallMin: repoAware.recallMin, recallMax: repoAware.recallMax },
      rangesOverlap,
      confusionMatrix,
      retrievalQuietModelNote,
    },
    pairs: pairRows.map((p) => ({
      id: p.id,
      repo: p.repo,
      method: p.method,
      confidence: p.confidence,
      diffOnlyCaught: p.diffOnlyCatchCount >= Math.ceil(runsPerPair / 2),
      diffOnlyCatchCount: p.diffOnlyCatchCount,
      diffOnlyRuns: p.runs,
      diffOnlyCostUsd: p.diffOnlyCostUsd,
      diffOnlyLatencyMs: p.diffOnlyLatencyMs,
      repoAwareCaught: p.repoAwareCatchCount >= Math.ceil(runsPerPair / 2),
      repoAwareCatchCount: p.repoAwareCatchCount,
      repoAwareRuns: p.runs,
      repoAwareCostUsd: p.repoAwareCostUsd,
      repoAwareLatencyMs: p.repoAwareLatencyMs,
      divergenceNote: null as string | null,
    })),
  };

  const date = new Date().toISOString().slice(0, 10);
  const jsonPath = join(REPORTS_DIR, `${date}-comparison-${split}.json`);
  writeFileSync(jsonPath, JSON.stringify(jsonReport, null, 2));
  console.log(`\n[aggregate-repeated] JSON written to ${jsonPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
