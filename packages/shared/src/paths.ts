import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Walks up from `startDir` to find the pnpm workspace root (marked by
 * pnpm-workspace.yaml). Falls back to `startDir` if not found.
 *
 * Needed because turbo/pnpm run each package's "dev" script with that
 * package's own directory as cwd (e.g. apps/worker), not the repo root - so
 * a relative path from .env like GITHUB_PRIVATE_KEY_PATH=./private-key.pem
 * would otherwise resolve differently depending on which app happens to
 * read it.
 */
export function findRepoRoot(startDir: string = process.cwd()): string {
  let dir = startDir;
  for (;;) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return startDir;
    dir = parent;
  }
}
