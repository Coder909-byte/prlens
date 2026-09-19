import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { STATE_DIR } from "./state.js";
import type { PairConfidence, PairMethod, RepoRef } from "./types.js";
import { repoKey } from "./types.js";

/**
 * A per-repo mining run's own record, separate from RepoState (the resume
 * cursors) - this is a diagnostic trail, not something a later run reads
 * back. Written incrementally (after every PR processed, not just at the
 * end) so a crash - like psf/requests' pilot failure, whose stdout and exit
 * reason were lost when the session restarted - still leaves the counts and
 * the error on disk.
 */
export interface RunLog {
  repo: string;
  startedAt: string;
  endedAt?: string;
  status: "running" | "completed" | "failed";
  commitsScanned: number;
  prsScanned: number;
  apiCallsUsed: number;
  candidatesFound: number;
  byMethod: Partial<Record<PairMethod, number>>;
  byConfidence: Partial<Record<PairConfidence, number>>;
  diskGb?: number;
  error?: { message: string; stack?: string };
}

function runLogPath(repo: RepoRef): string {
  return join(STATE_DIR, `${repoKey(repo)}.run.json`);
}

export function initRunLog(repo: RepoRef): RunLog {
  return {
    repo: `${repo.owner}/${repo.name}`,
    startedAt: new Date().toISOString(),
    status: "running",
    commitsScanned: 0,
    prsScanned: 0,
    apiCallsUsed: 0,
    candidatesFound: 0,
    byMethod: {},
    byConfidence: {},
  };
}

/** Atomic write (temp file + rename), same pattern as state.ts - an interrupted write must never leave a truncated run log to read post-mortem. */
export function saveRunLog(repo: RepoRef, log: RunLog): void {
  mkdirSync(STATE_DIR, { recursive: true });
  const path = runLogPath(repo);
  const tmpPath = `${path}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(log, null, 2));
  renameSync(tmpPath, path);
}

export function recordPairs(log: RunLog, pairs: { method: PairMethod; confidence: PairConfidence }[]): void {
  for (const p of pairs) {
    log.byMethod[p.method] = (log.byMethod[p.method] ?? 0) + 1;
    log.byConfidence[p.confidence] = (log.byConfidence[p.confidence] ?? 0) + 1;
  }
  log.candidatesFound += pairs.length;
}
