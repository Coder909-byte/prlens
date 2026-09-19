import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createMinerOctokit } from "./github.js";
import { REPOS_OUTPUT_DIR } from "./output.js";
import type { MinedPair } from "./types.js";

const LINK_KEYWORDS = /\b(?:fixes?|closes?|resolves?)\s+#(\d+)/i;

async function fetchIssueTitle(
  octokit: ReturnType<typeof createMinerOctokit>,
  owner: string,
  repo: string,
  issueNumber: number,
): Promise<string | undefined> {
  try {
    const { data } = await octokit.rest.issues.get({ owner, repo, issue_number: issueNumber });
    return data.title;
  } catch {
    return undefined;
  }
}

/**
 * One-time backfill for pairs mined before `summary` existed on MinedPair.
 * New mining runs populate it inline (see identify.ts); this just catches up
 * already-committed repos/*.json files without a full re-scan.
 */
async function main(): Promise<void> {
  const octokit = createMinerOctokit();
  const files = readdirSync(REPOS_OUTPUT_DIR).filter((f) => f.endsWith(".json"));

  for (const filename of files) {
    const match = /^(.+?)__(.+)\.json$/.exec(filename);
    if (!match?.[1] || !match[2]) continue;
    const owner: string = match[1];
    const name: string = match[2];

    const pairs = JSON.parse(readFileSync(join(REPOS_OUTPUT_DIR, filename), "utf8")) as MinedPair[];
    const prCache = new Map<number, { title: string; body: string }>();
    let changed = false;

    for (const pair of pairs) {
      if (pair.summary) continue;

      let prData = prCache.get(pair.fixPr.number);
      if (!prData) {
        const { data } = await octokit.rest.pulls.get({ owner, repo: name, pull_number: pair.fixPr.number });
        prData = { title: data.title, body: data.body ?? "" };
        prCache.set(pair.fixPr.number, prData);
      }

      const issueMatch = LINK_KEYWORDS.exec(`${prData.title}\n${prData.body}`);
      const issueNumber = issueMatch?.[1] ? Number(issueMatch[1]) : undefined;
      const issueSummary = issueNumber !== undefined ? await fetchIssueTitle(octokit, owner, name, issueNumber) : undefined;

      pair.summary = { fixSummary: prData.title, issueSummary };
      changed = true;
    }

    if (changed) {
      writeFileSync(join(REPOS_OUTPUT_DIR, filename), JSON.stringify(pairs, null, 2));
      console.log(`[${owner}/${name}] backfilled summaries for ${pairs.filter((p) => p.summary).length}/${pairs.length} pairs`);
    } else {
      console.log(`[${owner}/${name}] nothing to backfill`);
    }
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
