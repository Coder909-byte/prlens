import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { MinedPair, PairConfidence, RepoRef } from "./types.js";
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

const CONFIDENCE_RANK: Record<PairConfidence, number> = { high: 0, medium: 1, "needs-review": 2 };

/**
 * Collapses pairs that share an introducing commit/PR AND fix PR into one -
 * `git log -L` walking several hunks of the same fix PR back to the same
 * bulk-change commit is common, and surfacing each file as its own
 * "candidate bug" overstates the dataset and asks for the same review
 * decision three times. The merged pair keeps every ground-truth range
 * (still useful for scoring - the fix PR's diff really does touch all of
 * them) and the most cautious confidence/notes among the group.
 */
export function collapseDuplicatePairs(pairs: MinedPair[]): MinedPair[] {
  const groups = new Map<string, MinedPair[]>();
  for (const pair of pairs) {
    const introKey = pair.buggyPr.number !== null ? `pr:${pair.buggyPr.number}` : `sha:${pair.buggyPr.headSha}`;
    const key = `${introKey}:fix:${pair.fixPr.number}`;
    const group = groups.get(key);
    if (group) group.push(pair);
    else groups.set(key, [pair]);
  }

  const collapsed: MinedPair[] = [];
  for (const group of groups.values()) {
    if (group.length === 1) {
      collapsed.push(group[0]!);
      continue;
    }
    const first = group[0]!;
    const groundTruth = group.flatMap((p) => p.groundTruth);
    const confidence = group.reduce<PairConfidence>(
      (worst, p) => (CONFIDENCE_RANK[p.confidence] > CONFIDENCE_RANK[worst] ? p.confidence : worst),
      first.confidence,
    );
    const notes = [...new Set(group.map((p) => p.note).filter((n): n is string => !!n))];
    collapsed.push({
      ...first,
      id: `${first.repo}#${first.fixPr.number}:${introKey(first)}`,
      groundTruth,
      confidence,
      note: [`collapsed ${group.length} near-duplicate candidates sharing this introducing/fix pair`, ...notes].join(" | "),
    });
  }
  return collapsed;
}

function introKey(pair: MinedPair): string {
  return pair.buggyPr.number !== null ? `pr${pair.buggyPr.number}` : pair.buggyPr.headSha.slice(0, 7);
}

/** Merges new pairs into the repo's committed output file by id (new entries win on id collision), collapses near-duplicates, atomically. */
export function mergePairs(repo: RepoRef, newPairs: MinedPair[]): MinedPair[] {
  const existing = loadExistingPairs(repo);
  const byId = new Map(existing.map((p) => [p.id, p]));
  for (const pair of newPairs) byId.set(pair.id, pair);
  const merged = collapseDuplicatePairs([...byId.values()]);

  mkdirSync(REPOS_OUTPUT_DIR, { recursive: true });
  const path = outputPath(repo);
  const tmpPath = `${path}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(merged, null, 2));
  renameSync(tmpPath, path);

  return merged;
}
