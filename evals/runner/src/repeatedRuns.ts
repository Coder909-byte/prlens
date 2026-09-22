import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { filterDiffFiles, runDiffOnlyReview, runRepoAwareReview, extractHunks } from "@prlens/reviewer";
import { ensureIndex, retrieveContext, type RetrievedContext } from "@prlens/indexer";
import { computeCostUsd } from "@prlens/shared";
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
 *
 * Resumable and writes incrementally (after every single call, not just at
 * the end) - the first version of this script only wrote once at the very
 * end and lost an entire ~110-call run to an unrelated process restart
 * partway through. Re-running this script now only makes the calls missing
 * from the existing output file, so an interruption anywhere only costs the
 * calls after that point, never the whole run.
 */
const REPS = 5;
const CONTEXT_TOKENS = 2000;
const PROVIDER = "groq" as const;
// groq's TPM limit (8000) is small enough that some single repo-aware calls
// (observed up to ~7400 total tokens) can nearly exhaust it alone - rpm-based
// pacing can't fully prevent an occasional 429, so this also retries with a
// long backoff rather than trying to compute a perfectly safe interval.
const RPM = 3;

const OUT_PATH = join(dirname(fileURLToPath(import.meta.url)), "..", ".cache", "repeated-runs.json");

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
  costUsd: number | null;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
}

function recordKey(r: Pick<RunRecord, "pairId" | "mode" | "rep">): string {
  return `${r.pairId}::${r.mode}::${r.rep}`;
}

function loadExisting(): RunRecord[] {
  if (!existsSync(OUT_PATH)) return [];
  try {
    return JSON.parse(readFileSync(OUT_PATH, "utf8")) as RunRecord[];
  } catch {
    return [];
  }
}

/** Atomic write (tmp + rename) so a crash mid-write never corrupts the file a later resume would read. */
function saveRecords(records: RunRecord[]): void {
  mkdirSync(dirname(OUT_PATH), { recursive: true });
  const tmpPath = `${OUT_PATH}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(records, null, 2));
  renameSync(tmpPath, OUT_PATH);
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

  const records = loadExisting();
  const done = new Set(records.map(recordKey));
  console.error(`[repeated-runs] resuming: ${records.length} records already present, ${pairs.length * 2 * REPS - records.length} remaining`);

  for (const pair of pairs) {
    const pairKeys = (["diff-only", "repo-aware"] as const).flatMap((mode) =>
      Array.from({ length: REPS }, (_, i) => recordKey({ pairId: pair.id, mode, rep: i + 1 })),
    );
    if (pairKeys.every((k) => done.has(k))) continue; // this pair is already fully covered - skip fetching its diff at all

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
        const key = recordKey({ pairId: pair.id, mode, rep });
        if (done.has(key)) continue;

        await limiter.acquire();
        const label = `${pair.id} ${mode} rep${rep}`;
        const startedAt = Date.now();
        const outcome = await callWithRetry(
          () =>
            mode === "diff-only"
              ? runDiffOnlyReview(included, skipped, { provider: PROVIDER, fallbackProviders: [] })
              : runRepoAwareReview(included, skipped, retrievedContexts, { provider: PROVIDER, fallbackProviders: [] }),
          label,
        );
        const latencyMs = Date.now() - startedAt;

        let record: RunRecord;
        if (!outcome) {
          record = {
            pairId: pair.id,
            repo: pair.repo,
            mode,
            rep,
            caught: false,
            falsePositives: 0,
            failed: true,
            retrievedItemCount,
            costUsd: null,
            latencyMs,
            inputTokens: 0,
            outputTokens: 0,
          };
          console.error(`[repeated-runs] ${label}: GAVE UP after 3 attempts`);
        } else {
          const { caught, falsePositives } = scoreFindings(pair, outcome.findings);
          const costUsd = computeCostUsd(outcome.provider, outcome.model, outcome.usage.inputTokens, outcome.usage.outputTokens);
          record = {
            pairId: pair.id,
            repo: pair.repo,
            mode,
            rep,
            caught,
            falsePositives,
            failed: outcome.failed,
            retrievedItemCount,
            costUsd,
            latencyMs,
            inputTokens: outcome.usage.inputTokens,
            outputTokens: outcome.usage.outputTokens,
          };
          console.error(`[repeated-runs] ${label}: caught=${caught} fp=${falsePositives} failed=${outcome.failed}`);
        }

        records.push(record);
        done.add(key);
        saveRecords(records);
      }
    }
  }

  console.error(`[repeated-runs] done: ${records.length} records at ${OUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
