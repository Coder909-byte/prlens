import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { MinedPair, SplitName } from "./types.js";

const here = dirname(fileURLToPath(import.meta.url));
const DATASET_DIR = join(here, "..", "..", "dataset");
const SPLIT_PATH = join(DATASET_DIR, "split.json");
const REPOS_DIR = join(DATASET_DIR, "repos");

interface SplitFile {
  note: string;
  generatedAt: string;
  pairs: Record<string, SplitName>;
}

function loadSplitFile(): SplitFile {
  return JSON.parse(readFileSync(SPLIT_PATH, "utf8")) as SplitFile;
}

function loadAllPairs(): Map<string, MinedPair> {
  const byId = new Map<string, MinedPair>();
  const files = readdirSync(REPOS_DIR).filter((f) => f.endsWith(".json"));
  for (const filename of files) {
    const pairs = JSON.parse(readFileSync(join(REPOS_DIR, filename), "utf8")) as MinedPair[];
    for (const pair of pairs) byId.set(pair.id, pair);
  }
  return byId;
}

/**
 * Pairs assigned to `split` in evals/dataset/split.json, resolved against
 * the committed repos/*.json - split.json only stores accepted pair ids, so
 * a pair whose repo file has since dropped it (re-filtered) is skipped with
 * a warning rather than silently producing a hole in the eval set.
 */
export function loadPairsForSplit(split: SplitName): MinedPair[] {
  const splitFile = loadSplitFile();
  const allPairs = loadAllPairs();

  const result: MinedPair[] = [];
  for (const [pairId, assignedSplit] of Object.entries(splitFile.pairs)) {
    if (assignedSplit !== split) continue;
    const pair = allPairs.get(pairId);
    if (!pair) {
      console.warn(`[eval] split.json references ${pairId}, but it's no longer in evals/dataset/repos/ - skipping`);
      continue;
    }
    if (pair.unusable) {
      console.warn(`[eval] ${pairId} is marked unusable (${pair.unusable.reason}) - skipping`);
      continue;
    }
    result.push(pair);
  }
  return result;
}

export function getSplitNote(): string {
  return loadSplitFile().note;
}
