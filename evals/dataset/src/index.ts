import { createMinerOctokit, apiCallCounter } from "./github.js";
import { ensureCloned, getReposDirSizeGb, DiskCapExceededError } from "./clone.js";
import { findRevertPairs, findIssueLinkPairs, type PrOutcome } from "./identify.js";
import { loadState, saveState } from "./state.js";
import { mergePairs } from "./output.js";
import { CANDIDATE_REPOS } from "./repos.js";
import { initRunLog, saveRunLog, recordPairs } from "./runlog.js";
import type { RepoRef } from "./types.js";

interface Args {
  repo?: string;
  pilot?: number;
  maxDiskGb: number;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { maxDiskGb: 5 };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--repo") args.repo = argv[++i];
    else if (arg === "--pilot") args.pilot = Number(argv[++i]);
    else if (arg === "--max-disk-gb") args.maxDiskGb = Number(argv[++i]);
  }
  return args;
}

function parseRepoRef(spec: string): RepoRef {
  const [owner, name] = spec.split("/");
  if (!owner || !name) throw new Error(`--repo must be "owner/name", got "${spec}"`);
  return { owner, name };
}

async function mineRepo(repo: RepoRef, prLimit: number, maxDiskGb: number): Promise<void> {
  const label = `${repo.owner}/${repo.name}`;
  const startedAt = Date.now();
  const startingApiCalls = apiCallCounter.count;

  console.log(`\n=== ${label} ===`);
  const octokit = createMinerOctokit();

  const runLog = initRunLog(repo);
  saveRunLog(repo, runLog);

  try {
    let repoDir: string;
    try {
      repoDir = await ensureCloned(repo, maxDiskGb);
    } catch (err) {
      if (err instanceof DiskCapExceededError) {
        console.error(`[${label}] ${err.message}`);
        runLog.status = "failed";
        runLog.endedAt = new Date().toISOString();
        runLog.error = { message: err.message };
        saveRunLog(repo, runLog);
        return;
      }
      throw err;
    }

    const state = loadState(repo);

    console.log(`[${label}] scanning default-branch commits for reverts (since ${state.revertScan.lastNewestSha ?? "the beginning"})...`);
    const revertResult = await findRevertPairs(octokit, repo.owner, repo.name, state.revertScan.lastNewestSha);
    state.revertScan.lastNewestSha = revertResult.newestSha ?? state.revertScan.lastNewestSha;
    saveState(repo, state);
    console.log(`[${label}] revert scan: ${revertResult.commitsScanned} commits scanned, ${revertResult.pairs.length} pairs found`);

    runLog.commitsScanned = revertResult.commitsScanned;
    runLog.apiCallsUsed = apiCallCounter.count - startingApiCalls;
    recordPairs(runLog, revertResult.pairs);
    saveRunLog(repo, runLog);

    console.log(`[${label}] scanning merged PRs for issue-linked fixes (after #${state.prScan.lastPrNumber}, limit ${prLimit})...`);
    const alreadyProcessed = new Set(Object.keys(state.prScan.processed).map(Number));
    const issueLinkResult = await findIssueLinkPairs(
      octokit,
      repoDir,
      repo.owner,
      repo.name,
      state.prScan.lastPrNumber,
      alreadyProcessed,
      prLimit,
      (prNumber: number, outcome: PrOutcome, pairs) => {
        state.prScan.processed[prNumber] = outcome;
        state.prScan.lastPrNumber = Math.max(state.prScan.lastPrNumber, prNumber);
        saveState(repo, state);

        runLog.prsScanned += 1;
        runLog.apiCallsUsed = apiCallCounter.count - startingApiCalls;
        recordPairs(runLog, pairs);
        saveRunLog(repo, runLog);
      },
    );
    console.log(`[${label}] issue-link scan: ${issueLinkResult.prsScanned} PRs scanned, ${issueLinkResult.pairs.length} pairs found`);

    const allPairs = [...revertResult.pairs, ...issueLinkResult.pairs];
    const merged = mergePairs(repo, allPairs);

    const byMethod = { revert: 0, "issue-link": 0 } as Record<string, number>;
    const byConfidence = { high: 0, medium: 0, "needs-review": 0 } as Record<string, number>;
    for (const p of allPairs) {
      byMethod[p.method] = (byMethod[p.method] ?? 0) + 1;
      byConfidence[p.confidence] = (byConfidence[p.confidence] ?? 0) + 1;
    }

    const wallClockMs = Date.now() - startedAt;
    const apiCallsUsed = apiCallCounter.count - startingApiCalls;

    console.log(`[${label}] new candidates this run: ${allPairs.length} (total committed for this repo: ${merged.length})`);
    console.log(`[${label}]   by method: revert=${byMethod.revert ?? 0}, issue-link=${byMethod["issue-link"] ?? 0}`);
    console.log(`[${label}]   by confidence: high=${byConfidence.high ?? 0}, medium=${byConfidence.medium ?? 0}, needs-review=${byConfidence["needs-review"] ?? 0}`);
    console.log(`[${label}]   wall-clock: ${(wallClockMs / 1000).toFixed(1)}s, API calls: ${apiCallsUsed}`);

    const diskGb = await getReposDirSizeGb();
    console.log(`[${label}]   .repos/ total size: ${diskGb.toFixed(2)}GB / ${maxDiskGb}GB cap`);

    runLog.status = "completed";
    runLog.endedAt = new Date().toISOString();
    runLog.apiCallsUsed = apiCallsUsed;
    runLog.diskGb = diskGb;
    saveRunLog(repo, runLog);
  } catch (err) {
    const error = err instanceof Error ? { message: err.message, stack: err.stack } : { message: String(err) };
    runLog.status = "failed";
    runLog.endedAt = new Date().toISOString();
    runLog.apiCallsUsed = apiCallCounter.count - startingApiCalls;
    runLog.error = error;
    saveRunLog(repo, runLog);
    throw err;
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const prLimit = args.pilot ?? 100_000;

  const repos: RepoRef[] = args.repo ? [parseRepoRef(args.repo)] : CANDIDATE_REPOS;

  for (const repo of repos) {
    await mineRepo(repo, prLimit, args.maxDiskGb);
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
