import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { RepoIndex } from "./types.js";

const here = dirname(fileURLToPath(import.meta.url));
export const CACHE_DIR = join(here, "..", ".cache");

function cachePath(owner: string, name: string, sha: string): string {
  return join(CACHE_DIR, `${owner}__${name}__${sha}.json`);
}

export function readIndexCache(owner: string, name: string, sha: string): RepoIndex | null {
  const path = cachePath(owner, name, sha);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8")) as RepoIndex;
}

export function writeIndexCache(owner: string, name: string, sha: string, index: RepoIndex): void {
  mkdirSync(CACHE_DIR, { recursive: true });
  const path = cachePath(owner, name, sha);
  const tmpPath = `${path}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(index));
  renameSync(tmpPath, path);
}

/** Deletes one (repo, sha)'s cached index JSON, if present - a real PR's headSha is essentially never reused, so keeping every past review's cache around indefinitely just grows disk with no future benefit. */
export function deleteIndexCache(owner: string, name: string, sha: string): void {
  rmSync(cachePath(owner, name, sha), { force: true });
}
