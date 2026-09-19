import { readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createMinerOctokit } from "./github.js";
import { REPOS_OUTPUT_DIR, collapseDuplicatePairs } from "./output.js";
import { isReviewableGroundTruthFile, looksLikeBugFix, resolveLinkedIssue, labelsContradictBugFix } from "./identify.js";
import type { MinedPair } from "./types.js";

/**
 * Retroactively applies filters added after some data was already mined, to
 * already-committed repos/*.json:
 *  - same-PR pairs (introducing PR === fix PR - a PR reverting its own
 *    in-progress work, not a real historical bug)
 *  - non-reviewable/test-only ground truth (CI config, package
 *    manifests/lockfiles, test/spec files)
 *  - feature additions mis-matched as fixes (issue-link tier only - the bug
 *    signal must be in the PR's own title, or, for a neutral title, in the
 *    linked issue's own title/label; a feature-shaped title or a non-bug
 *    issue label disqualifies outright)
 *  - near-duplicate candidates sharing an introducing/fix pair
 *
 * The file-path and same-PR checks are pure functions of data already on
 * disk - no API calls. The title/label checks need fresh API calls
 * (re-fetching the fix PR's body to find the linked issue, then that
 * issue's title/labels) - a small, bounded number, since it only runs on
 * issue-link pairs that already survived the file-path and same-PR filters.
 */
async function main(): Promise<void> {
  const octokit = createMinerOctokit();
  const files = readdirSync(REPOS_OUTPUT_DIR).filter((f) => f.endsWith(".json"));
  let totalBefore = 0;
  let totalAfter = 0;

  for (const filename of files) {
    const match = /^(.+?)__(.+)\.json$/.exec(filename);
    const path = join(REPOS_OUTPUT_DIR, filename);
    const pairs = JSON.parse(readFileSync(path, "utf8")) as MinedPair[];
    totalBefore += pairs.length;

    let survivors = pairs.filter((pair) => !(pair.buggyPr.number !== null && pair.buggyPr.number === pair.fixPr.number));
    const samePrDropped = pairs.length - survivors.length;

    survivors = survivors
      .map((pair) => ({ ...pair, groundTruth: pair.groundTruth.filter((gt) => isReviewableGroundTruthFile(gt.file)) }))
      .filter((pair) => pair.groundTruth.length > 0);
    const fileFilterDropped = pairs.length - samePrDropped - survivors.length;

    let titleFilterDropped = 0;
    let labelFilterDropped = 0;
    if (match?.[1] && match[2]) {
      const owner = match[1];
      const name = match[2];
      const kept: MinedPair[] = [];
      for (const pair of survivors) {
        if (pair.method === "issue-link") {
          const prData = await octokit.rest.pulls.get({ owner, repo: name, pull_number: pair.fixPr.number }).then(
            (r) => r.data,
            () => undefined,
          );
          const linkedIssue = prData ? await resolveLinkedIssue(octokit, owner, name, `${prData.title}\n${prData.body ?? ""}`) : undefined;
          if (!looksLikeBugFix(pair.summary?.fixSummary ?? "", linkedIssue)) {
            titleFilterDropped += 1;
            continue;
          }
          if (labelsContradictBugFix(linkedIssue)) {
            labelFilterDropped += 1;
            continue;
          }
        }
        kept.push(pair);
      }
      survivors = kept;
    }

    const deduped = collapseDuplicatePairs(survivors);
    totalAfter += deduped.length;

    console.log(
      `[${filename}] ${pairs.length} -> ${deduped.length} (same-PR: ${samePrDropped}, non-reviewable/test ground truth: ${fileFilterDropped}, feature-title: ${titleFilterDropped}, feature-label: ${labelFilterDropped}, collapsed: ${survivors.length - deduped.length})`,
    );

    writeFileSync(`${path}.tmp`, JSON.stringify(deduped, null, 2));
    renameSync(`${path}.tmp`, path);
  }

  console.log(`\nTotal: ${totalBefore} -> ${totalAfter}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
