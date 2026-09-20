import { config, computeCostUsd } from "@prlens/shared";
import {
  filterDiffFiles,
  runDiffOnlyReview,
  runRepoAwareReview,
  loadPrompt,
  DIFF_ONLY_PROMPT_VERSION,
  REPO_AWARE_PROMPT_VERSION,
  type PrFile,
} from "@prlens/reviewer";
import { ensureIndex, retrieveContext, type RetrievedContext } from "@prlens/indexer";
import type { Octokit } from "octokit";
import { cacheKey, hashPromptText, readCache, writeCache, type CacheEntry } from "./cache.js";
import { extractHunks } from "./hunks.js";
import { RateLimiter } from "./rateLimit.js";
import { scoreFindings, type PairScore } from "./scoring.js";
import type { MinedPair, RunOptions } from "./types.js";

/** The PR (or, for a PR-less direct push, the commit) actually reviewed - always the INTRODUCING side, since the benchmark measures whether review at introduction time would have caught the bug (CLAUDE.md's dataset definition), not whether the later fix looks reasonable. */
async function fetchIntroducingFiles(octokit: Octokit, repo: string, pair: MinedPair): Promise<PrFile[]> {
  const [owner, name] = repo.split("/") as [string, string];
  if (pair.buggyPr.number !== null) {
    return octokit.paginate(octokit.rest.pulls.listFiles, { owner, repo: name, pull_number: pair.buggyPr.number, per_page: 100 });
  }
  const { data } = await octokit.rest.repos.getCommit({ owner, repo: name, ref: pair.buggyPr.headSha });
  return (data.files ?? []).map((f) => ({ filename: f.filename, status: f.status, patch: f.patch }));
}

export interface EvalRunResult {
  scores: PairScore[];
  cacheHits: number;
  cacheMisses: number;
}

function promptVersionFor(mode: RunOptions["mode"]): string {
  return mode === "repo-aware" ? REPO_AWARE_PROMPT_VERSION : DIFF_ONLY_PROMPT_VERSION;
}

export async function runEval(pairs: MinedPair[], octokit: Octokit, options: RunOptions): Promise<EvalRunResult> {
  const promptVersion = promptVersionFor(options.mode);
  const promptHash = hashPromptText(loadPrompt(promptVersion));
  const rateLimiter = new RateLimiter(options.rpm);

  // Pre-flight: how many pairs actually need an LLM call (cache misses only).
  const plans = pairs.map((pair) => {
    const key = cacheKey({
      repo: pair.repo,
      prNumber: pair.buggyPr.number,
      headSha: pair.buggyPr.headSha,
      mode: options.mode,
      provider: options.provider,
      model: options.model ?? "default",
      promptHash,
    });
    return { pair, key, cached: readCache(key) };
  });
  const misses = plans.filter((p) => !p.cached);
  const estMinutes = (misses.length / options.rpm).toFixed(1);
  console.log(`[eval] ${pairs.length} pairs, ${plans.length - misses.length} cached, ${misses.length} need an LLM call (~${estMinutes} min at ${options.rpm} RPM)`);

  const scores: PairScore[] = [];
  let cacheHits = 0;
  let cacheMisses = 0;

  for (const { pair, key, cached } of plans) {
    let entry: CacheEntry;
    if (cached) {
      entry = cached;
      cacheHits++;
    } else {
      cacheMisses++;
      await rateLimiter.acquire();
      const startedAt = Date.now();

      const files = await fetchIntroducingFiles(octokit, pair.repo, pair);
      const { included, skipped } = filterDiffFiles(files, config.MAX_DIFF_BYTES);

      const reviewOptions = {
        provider: options.provider,
        model: options.model,
        fallbackProviders: [], // eval runs must be single-provider, no silent fallback
        reportMissingTests: false,
      };

      let retrievedContexts: RetrievedContext[] | undefined;
      const outcome =
        options.mode === "diff-only"
          ? await runDiffOnlyReview(included, skipped, reviewOptions)
          : await (async () => {
              const [owner, name] = pair.repo.split("/") as [string, string];
              // Indexed at the introducing PR's BASE sha - the diff already
              // shows the changed code, retrieval's job is the pre-existing
              // context the diff doesn't show (see packages/indexer's plan).
              const index = await ensureIndex(owner, name, pair.buggyPr.baseSha);
              const hunks = extractHunks(included);
              retrievedContexts = hunks.map((hunk) => retrieveContext(index, hunk, options.contextTokens));
              return runRepoAwareReview(included, skipped, retrievedContexts, reviewOptions);
            })();

      const latencyMs = Date.now() - startedAt;
      const costUsd = computeCostUsd(outcome.provider, outcome.model, outcome.usage.inputTokens, outcome.usage.outputTokens);

      entry = {
        pairId: pair.id,
        mode: options.mode,
        provider: outcome.provider,
        model: outcome.model,
        promptVersion,
        findings: outcome.findings,
        inputTokens: outcome.usage.inputTokens,
        outputTokens: outcome.usage.outputTokens,
        costUsd,
        latencyMs,
        failed: outcome.failed,
        retrievedContext: retrievedContexts,
      };
      writeCache(key, entry);
    }

    const { caught, falsePositives } = scoreFindings(pair, entry.findings);
    scores.push({
      pairId: pair.id,
      repo: pair.repo,
      caught,
      falsePositives,
      latencyMs: entry.latencyMs,
      costUsd: entry.costUsd,
      inputTokens: entry.inputTokens,
      outputTokens: entry.outputTokens,
      failed: entry.failed,
    });
  }

  return { scores, cacheHits, cacheMisses };
}
