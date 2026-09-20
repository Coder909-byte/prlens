import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
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
