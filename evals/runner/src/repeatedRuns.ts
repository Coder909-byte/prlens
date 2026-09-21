import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { filterDiffFiles, runDiffOnlyReview, runRepoAwareReview, extractHunks } from "@prlens/reviewer";
import { ensureIndex, retrieveContext, type RetrievedContext } from "@prlens/indexer";
import { createEvalOctokit } from "./github.js";
import { loadPairsForSplit } from "./splits.js";
import { fetchIntroducingFiles } from "./runEval.js";
import { scoreFindings } from "./scoring.js";
import { RateLimiter } from "./rateLimit.js";
import type { EvalMode } from "./types.js";

/**
 * Standalone repeated-run methodology - NOT part of the normal `pnpm eval`
 * path and deliberately bypasses cache.ts's single-slot cache, since the
 * whole point here is 5 independent fresh LLM calls per pair per mode, not
 * one cached result. Written after a single-run comparison showed a large
 * (36.4% -> 54.5%) recall swing on identical retrieved context - i.e. LLM
 * output non-determinism, not a real effect - which means single runs can't
 * support any diff-only vs. repo-aware comparison on this dataset size.
 */
const REPS = 5;
const CONTEXT_TOKENS = 2000;
const PROVIDER = "groq" as const;
// groq's TPM limit (8000) is small enough that some single repo-aware calls
// (observed up to ~7400 total tokens) can nearly exhaust it alone - rpm-based
// pacing can't fully prevent an occasional 429, so this also retries with a
// long backoff rather than trying to compute a perfectly safe interval.
const RPM = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface RunRecord {
  pairId: string;
  repo: string;
  mode: EvalMode;
  rep: number;
  caught: boolean;
  falsePositives: number;
  failed: boolean;
  retrievedItemCount: number;
}

async function callWithRetry<T>(fn: () => Promise<T>, label: string): Promise<T | null> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await fn();
    } catch (err) {
      console.error(`[repeated-runs] ${label} failed (attempt ${attempt}/3): ${err instanceof Error ? err.message : String(err)}`);
      if (attempt < 3) {
        console.error("[repeated-runs] backing off 65s before retry...");
        await sleep(65_000);
      }
    }
  }
  return null;
}

async function main(): Promise<void> {
  const pairs = loadPairsForSplit("dev");
  const octokit = createEvalOctokit();
  const limiter = new RateLimiter(RPM);
  const records: RunRecord[] = [];

  for (const pair of pairs) {
    console.error(`[repeated-runs] === ${pair.id} ===`);
    const files = await fetchIntroducingFiles(octokit, pair.repo, pair);
    const { included, skipped } = filterDiffFiles(files, 60_000);

    let retrievedContexts: RetrievedContext[] = [];
    if (included.length > 0) {
      const [owner, name] = pair.repo.split("/") as [string, string];
      const index = await ensureIndex(owner, name, pair.buggyPr.headSha);
      const hunks = extractHunks(included);
      retrievedContexts = hunks.map((h) => retrieveContext(index, h, CONTEXT_TOKENS));
    }
    const retrievedItemCount = retrievedContexts.reduce((n, c) => n + c.items.length, 0);

    for (const mode of ["diff-only", "repo-aware"] as const) {
      for (let rep = 1; rep <= REPS; rep++) {
        await limiter.acquire();
        const label = `${pair.id} ${mode} rep${rep}`;
        const outcome = await callWithRetry(
          () =>
            mode === "diff-only"
              ? runDiffOnlyReview(included, skipped, { provider: PROVIDER, fallbackProviders: [] })
              : runRepoAwareReview(included, skipped, retrievedContexts, { provider: PROVIDER, fallbackProviders: [] }),
          label,
        );

        if (!outcome) {
          records.push({ pairId: pair.id, repo: pair.repo, mode, rep, caught: false, falsePositives: 0, failed: true, retrievedItemCount });
          console.error(`[repeated-runs] ${label}: GAVE UP after 3 attempts`);
          continue;
        }

        const { caught, falsePositives } = scoreFindings(pair, outcome.findings);
        records.push({ pairId: pair.id, repo: pair.repo, mode, rep, caught, falsePositives, failed: outcome.failed, retrievedItemCount });
        console.error(`[repeated-runs] ${label}: caught=${caught} fp=${falsePositives} failed=${outcome.failed}`);
      }
    }
  }

  const outPath = join(dirname(fileURLToPath(import.meta.url)), "..", ".cache", "repeated-runs.json");
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(records, null, 2));
  console.error(`[repeated-runs] wrote ${records.length} records to ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
