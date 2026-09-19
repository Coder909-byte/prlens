import { readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createMinerOctokit } from "./github.js";
import { ensureCloned, showCommitFilePatch } from "./clone.js";
import { REPOS_OUTPUT_DIR } from "./output.js";
import type { MinedPair } from "./types.js";

export interface EnrichedPair extends MinedPair {
  /** The introducing PR's (or, for a PR-less direct push, the commit's own) patch for each ground-truth file - what a diff-only reviewer would have seen. */
  introducingPatches: { file: string; patch: string }[];
  /** The fix PR's patch for each ground-truth file - for side-by-side context in the review UI. */
  fixPatches: { file: string; patch: string }[];
}

// A whole-file-creation diff (the file didn't exist before this commit) or
// an oversized one gives no meaningful "this specific bug was introduced
// here" signal - `git log -L` walking a line back to a from-scratch file
// creation just means the line has existed since the file's first version,
// not that this commit is a precise, isolated bug introduction.
const MAX_INTRODUCING_PATCH_LINES = 200;

function isFileCreationDiff(patch: string): boolean {
  return /^--- \/dev\/null/m.test(patch) || /^new file mode/m.test(patch);
}

function introducingPatchIssue(patch: string): string | undefined {
  if (isFileCreationDiff(patch)) {
    return "introducing commit creates this file from scratch - not a meaningful single-bug introduction";
  }
  const lineCount = patch.split("\n").length;
  if (lineCount > MAX_INTRODUCING_PATCH_LINES) {
    return `introducing diff for this file is ${lineCount} lines - too large to treat as a precise single-bug introduction`;
  }
  return undefined;
}

/**
 * Enriches every committed pair (across all mined repos) with the actual
 * diff text for its ground-truth files - the mined JSON only stores line
 * ranges, and the review UI (a static Artifact page, CSP-blocked from
 * fetching GitHub at view time) needs the real content embedded at publish
 * time. Run this after mining, before (re)publishing the review page.
 *
 * The introducing side is fetched the same way the scoring harness will
 * fetch it at eval time - `pulls.listFiles` on the owning PR when one
 * exists, so this build step surfaces exactly what a diff-only reviewer
 * would actually be shown, not an approximation of it. (A single-commit
 * `git show` on the PR's head SHA - the previous approach - silently
 * produces an empty diff whenever the ground-truth hunk actually landed in
 * an earlier commit of a multi-commit PR, which is common.) Only a
 * PR-less direct-push commit falls back to a local commit diff, since
 * there's no PR to query.
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

    const prFilesCache = new Map<number, Awaited<ReturnType<typeof octokit.rest.pulls.listFiles>>["data"]>();
    async function filesForPr(prNumber: number) {
      const cached = prFilesCache.get(prNumber);
      if (cached) return cached;
      const { data } = await octokit.rest.pulls.listFiles({ owner, repo: name, pull_number: prNumber, per_page: 100 });
      prFilesCache.set(prNumber, data);
      return data;
    }

    let repoFileChanged = false;

    for (const pair of pairs) {
      if (pair.unusable) continue; // already flagged by a previous run - stays out of the docket

      const introducingPatches: { file: string; patch: string }[] = [];
      for (const gt of pair.groundTruth) {
        let patch: string;
        if (pair.buggyPr.number !== null) {
          const introFiles = await filesForPr(pair.buggyPr.number);
          patch = introFiles.find((f) => f.filename === gt.file)?.patch ?? "";
        } else {
          patch = await showCommitFilePatch(repoDir, pair.buggyPr.headSha, gt.file).catch(() => "");
        }
        introducingPatches.push({ file: gt.file, patch });
      }

      const emptyPatch = introducingPatches.some((p) => !p.patch);
      const patchIssue = emptyPatch
        ? undefined
        : introducingPatches.map((p) => introducingPatchIssue(p.patch)).find((issue) => issue !== undefined);

      if (emptyPatch || patchIssue) {
        pair.unusable = {
          reason: emptyPatch
            ? pair.buggyPr.number !== null
              ? "GitHub's pulls.listFiles omits `patch` for this file (too large or binary) - the same call the scoring harness makes, so this pair can't be scored either"
              : "the introducing commit's own diff has no content for this file - ground truth likely mis-derived"
            : patchIssue!,
        };
        repoFileChanged = true;
        console.log(`[${owner}/${name}] ${pair.id} marked unusable: ${pair.unusable.reason}`);
        continue;
      }

      const fixFiles = await filesForPr(pair.fixPr.number);
      const fixPatches = pair.groundTruth.map((gt) => ({
        file: gt.file,
        patch: fixFiles.find((f) => f.filename === gt.file)?.patch ?? "",
      }));

      enriched.push({ ...pair, introducingPatches, fixPatches });
    }

    if (repoFileChanged) {
      const repoPath = join(REPOS_OUTPUT_DIR, filename);
      const tmpPath = `${repoPath}.tmp`;
      writeFileSync(tmpPath, JSON.stringify(pairs, null, 2));
      renameSync(tmpPath, repoPath);
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
