import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { RepoRef } from "./types.js";
import { repoKey } from "./types.js";

const here = dirname(fileURLToPath(import.meta.url));
export const STATE_DIR = join(here, "..", "state");

/**
 * Two independent, separately-checkpointed cursors per repo: the revert
 * scan walks default-branch commits, the PR scan walks merged PR numbers -
 * different loops over different things, so a resumed run needs to pick up
 * each one where it actually left off, not just "the last thing processed."
 */
export interface RepoState {
  revertScan: { lastNewestSha?: string };
  prScan: { lastPrNumber: number; processed: Record<number, "accepted" | "filtered" | "needs-review"> };
}

function statePath(repo: RepoRef): string {
  return join(STATE_DIR, `${repoKey(repo)}.json`);
}

export function loadState(repo: RepoRef): RepoState {
  const path = statePath(repo);
  if (!existsSync(path)) {
    return { revertScan: {}, prScan: { lastPrNumber: 0, processed: {} } };
  }
  return JSON.parse(readFileSync(path, "utf8")) as RepoState;
}

/** Atomic write (temp file + rename) so an interrupted write can't leave a corrupt/truncated state file. */
export function saveState(repo: RepoRef, state: RepoState): void {
  mkdirSync(STATE_DIR, { recursive: true });
  const path = statePath(repo);
  const tmpPath = `${path}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(state, null, 2));
  renameSync(tmpPath, path);
}
