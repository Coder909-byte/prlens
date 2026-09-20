import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));

/**
 * Own checkout dir, separate from evals/dataset/.repos/ - a small deliberate
 * duplication rather than a cross-import: this is product code (CLAUDE.md's
 * indexer, meant for apps/worker to eventually use), and evals/dataset is
 * eval-tooling (GITHUB_MINER_TOKEN, mining heuristics) - product code
 * depending on eval tooling is the wrong direction.
 */
export const REPOS_DIR = join(here, "..", ".repos");

async function git(cwd: string, args: string[], attempt = 0): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", args, { cwd, maxBuffer: 1024 * 1024 * 128 });
    return stdout;
  } catch (err) {
    if (attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
      return git(cwd, args, attempt + 1);
    }
    throw err;
  }
}

function repoDirFor(owner: string, name: string): string {
  return join(REPOS_DIR, `${owner}__${name}`);
}

/** Blobless partial clone (or fetch, if already cloned) + checkout at `sha`, detached. No disk cap here - the indexer only ever touches repos the eval/miner already validated as small enough. */
export async function checkoutAt(owner: string, name: string, sha: string): Promise<string> {
  const dir = repoDirFor(owner, name);

  if (existsSync(join(dir, ".git"))) {
    await git(dir, ["fetch", "--filter=blob:none", "origin"]);
  } else {
    mkdirSync(REPOS_DIR, { recursive: true });
    await git(REPOS_DIR, ["clone", "--filter=blob:none", "--no-checkout", `https://github.com/${owner}/${name}.git`, dir]);
  }

  await git(dir, ["checkout", "--detach", sha]);
  return dir;
}

/** Lists every file path in the checked-out tree at HEAD, relative to the repo root. */
export async function listTrackedFiles(repoDir: string): Promise<string[]> {
  const output = await git(repoDir, ["ls-tree", "-r", "--name-only", "HEAD"]);
  return output.split("\n").filter(Boolean);
}
