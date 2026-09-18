import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { RepoRef } from "./types.js";
import { repoKey } from "./types.js";

const execFileAsync = promisify(execFile);

const here = dirname(fileURLToPath(import.meta.url));
export const REPOS_DIR = join(here, "..", ".repos");

const MAX_BUFFER = 1024 * 1024 * 128;

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Runs a git subprocess with a small retry - GitHub's git-protocol lazy
 * blob-fetch path (used heavily by `git log -L` against a blobless clone)
 * has its own rate/abuse limiting, separate from the REST API's and not
 * covered by Octokit's throttling plugin.
 */
async function git(cwd: string, args: string[], attempt = 0): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", args, { cwd, maxBuffer: MAX_BUFFER });
    return stdout;
  } catch (err) {
    if (attempt < 2) {
      await sleep(1000 * 2 ** attempt);
      return git(cwd, args, attempt + 1);
    }
    throw err;
  }
}

/** Sum of `.repos/`'s on-disk size in GB (0 if it doesn't exist yet). */
export async function getReposDirSizeGb(): Promise<number> {
  if (!existsSync(REPOS_DIR)) return 0;
  const { stdout } = await execFileAsync("du", ["-sk", REPOS_DIR]);
  const kb = Number.parseInt(stdout.split("\t")[0] ?? "0", 10);
  return kb / (1024 * 1024);
}

export class DiskCapExceededError extends Error {}

/**
 * Clones (blobless partial clone - full commit history, blobs fetched
 * lazily as `git log -L` needs them, so `-L` stays correct for old bugs
 * without downloading every historical blob upfront) or fetches an existing
 * clone. Refuses to start a NEW clone once `.repos/` is at maxDiskGb - an
 * existing repo's incremental `fetch` is still allowed, since that's bounded
 * by how much changed, not the whole repo's size again.
 */
export async function ensureCloned(repo: RepoRef, maxDiskGb: number): Promise<string> {
  const dir = join(REPOS_DIR, repoKey(repo));

  if (existsSync(join(dir, ".git"))) {
    await git(dir, ["fetch", "--filter=blob:none", "origin"]);
    return dir;
  }

  const currentGb = await getReposDirSizeGb();
  if (currentGb >= maxDiskGb) {
    throw new DiskCapExceededError(
      `.repos/ is already using ${currentGb.toFixed(2)}GB (limit ${maxDiskGb}GB) - refusing to clone ${repo.owner}/${repo.name}. ` +
        `Free space, remove an existing clone under evals/dataset/.repos/, or raise --max-disk-gb.`,
    );
  }

  mkdirSync(REPOS_DIR, { recursive: true });
  await git(REPOS_DIR, [
    "clone",
    "--filter=blob:none",
    "--no-checkout",
    `https://github.com/${repo.owner}/${repo.name}.git`,
    dir,
  ]);
  return dir;
}

export interface LineHistoryEntry {
  sha: string;
  /** True if this commit's diff for the path shows a rename - `git log -L` doesn't follow renames, so history may continue further back under the old path. */
  looksLikeRename: boolean;
}

const COMMIT_HEADER = /^commit ([0-9a-f]{40})/gm;

/**
 * `git log -L <startLine>,<endLine>:<path> <sinceRef>` - walks the line
 * range's history backward starting from `sinceRef` (pass the fix's base
 * SHA to find what last touched these lines before the fix). Returns
 * entries newest-first; the first entry is the bug-introducing candidate.
 */
export async function lineHistory(
  repoDir: string,
  path: string,
  startLine: number,
  endLine: number,
  sinceRef: string,
): Promise<LineHistoryEntry[]> {
  let output: string;
  try {
    output = await git(repoDir, ["log", "--no-color", "-L", `${startLine},${endLine}:${path}`, sinceRef]);
  } catch {
    // File didn't exist under this path at sinceRef (created later, or
    // renamed) - no history to walk.
    return [];
  }

  const matches = [...output.matchAll(COMMIT_HEADER)];
  const entries: LineHistoryEntry[] = [];
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    if (!match) continue;
    const sha = match[1];
    if (!sha) continue;
    const start = match.index ?? 0;
    const end = i + 1 < matches.length ? (matches[i + 1]?.index ?? output.length) : output.length;
    const block = output.slice(start, end);
    entries.push({ sha, looksLikeRename: /^rename (from|to) /m.test(block) });
  }
  return entries;
}

/** The commit's own patch for one file, as `git show` unified diff text (used to extract the introducing commit's own hunk when it's the sole commit in its PR). */
export async function showCommitFilePatch(repoDir: string, sha: string, path: string): Promise<string> {
  return git(repoDir, ["show", "--no-color", "--format=", sha, "--", path]);
}
