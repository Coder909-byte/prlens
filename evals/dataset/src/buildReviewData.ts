import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createMinerOctokit } from "./github.js";
import { ensureCloned, showCommitFilePatch } from "./clone.js";
import { REPOS_OUTPUT_DIR } from "./output.js";
import type { MinedPair } from "./types.js";

export interface EnrichedPair extends MinedPair {
  /** The introducing commit's own patch for each ground-truth file - what a diff-only reviewer would have seen at buggyPr.headSha. */
  introducingPatches: { file: string; patch: string }[];
  /** The fix PR's patch for each ground-truth file - for side-by-side context in the review UI. */
  fixPatches: { file: string; patch: string }[];
}

/**
 * Enriches every committed pair (across all mined repos) with the actual
 * diff text for its ground-truth files - the mined JSON only stores line
 * ranges, and the review UI (a static Artifact page, CSP-blocked from
 * fetching GitHub at view time) needs the real content embedded at publish
 * time. Run this after mining, before (re)publishing the review page.
 */
async function main(): Promise<void> {
  const octokit = createMinerOctokit();
  const files = readdirSync(REPOS_OUTPUT_DIR).filter((f) => f.endsWith(".json"));
  const enriched: EnrichedPair[] = [];

  for (const filename of files) {
    const match = /^(.+?)__(.+)\.json$/.exec(filename);
    if (!match?.[1] || !match[2]) continue;
    const owner: string = match[1];
    const name: string = match[2];

    const pairs = JSON.parse(readFileSync(join(REPOS_OUTPUT_DIR, filename), "utf8")) as MinedPair[];
    if (pairs.length === 0) continue;

    console.log(`[${owner}/${name}] enriching ${pairs.length} pairs...`);
    const repoDir = await ensureCloned({ owner, name }, 5);

    const fixFilesCache = new Map<number, Awaited<ReturnType<typeof octokit.rest.pulls.listFiles>>["data"]>();
    async function fixFilesFor(prNumber: number) {
      const cached = fixFilesCache.get(prNumber);
      if (cached) return cached;
      const { data } = await octokit.rest.pulls.listFiles({ owner, repo: name, pull_number: prNumber, per_page: 100 });
      fixFilesCache.set(prNumber, data);
      return data;
    }

    for (const pair of pairs) {
      const introducingPatches: { file: string; patch: string }[] = [];
      for (const gt of pair.groundTruth) {
        const patch = await showCommitFilePatch(repoDir, pair.buggyPr.headSha, gt.file).catch(() => "");
        introducingPatches.push({ file: gt.file, patch });
      }

      const fixFiles = await fixFilesFor(pair.fixPr.number);
      const fixPatches = pair.groundTruth.map((gt) => ({
        file: gt.file,
        patch: fixFiles.find((f) => f.filename === gt.file)?.patch ?? "",
      }));

      enriched.push({ ...pair, introducingPatches, fixPatches });
    }
  }

  const outPath = join(REPOS_OUTPUT_DIR, "..", "review-data.json");
  writeFileSync(outPath, JSON.stringify(enriched, null, 2));
  console.log(`\nWrote ${enriched.length} enriched pairs to ${outPath}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
