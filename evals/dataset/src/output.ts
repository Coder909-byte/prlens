import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { MinedPair, RepoRef } from "./types.js";
import { repoKey } from "./types.js";

const here = dirname(fileURLToPath(import.meta.url));
export const REPOS_OUTPUT_DIR = join(here, "..", "repos");

function outputPath(repo: RepoRef): string {
  return join(REPOS_OUTPUT_DIR, `${repoKey(repo)}.json`);
}

export function loadExistingPairs(repo: RepoRef): MinedPair[] {
  const path = outputPath(repo);
  if (!existsSync(path)) return [];
  return JSON.parse(readFileSync(path, "utf8")) as MinedPair[];
}

/** Merges new pairs into the repo's committed output file by id (new entries win on id collision), atomically. */
export function mergePairs(repo: RepoRef, newPairs: MinedPair[]): MinedPair[] {
  const existing = loadExistingPairs(repo);
  const byId = new Map(existing.map((p) => [p.id, p]));
  for (const pair of newPairs) byId.set(pair.id, pair);
  const merged = [...byId.values()];

  mkdirSync(REPOS_OUTPUT_DIR, { recursive: true });
  const path = outputPath(repo);
  const tmpPath = `${path}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(merged, null, 2));
  renameSync(tmpPath, path);

  return merged;
}
