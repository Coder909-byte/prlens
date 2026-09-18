import type { Octokit } from "octokit";
import { lineHistory } from "./clone.js";
import { addedRange, parseHunks } from "./diffText.js";
import { deriveGroundTruth, resolveOwningPr } from "./groundTruth.js";
import type { MinedPair, PairConfidence } from "./types.js";

const FIX_KEYWORDS = /\b(fix|fixes|fixed|bug|crash|incorrect|wrong|regression)\b/i;
const LINK_KEYWORDS = /\b(?:fixes?|closes?|resolves?)\s+#(\d+)/gi;
const REVERT_TITLE = /^Revert "/;
const REVERT_TRAILER = /This reverts commit ([0-9a-f]{40})/;

const MAX_FILES = 3;
const MAX_CHANGED_LINES = 50;

// A "fix" to one of these isn't a code bug a diff-only reviewer would ever
// be asked to catch - seen in practice: a got PR fixing a typo in
// readme.md matched the fix-keyword heuristic and produced a ground-truth
// candidate that made no sense as a benchmark case.
export const NON_CODE_FILE = /(^|\/)(readme|changelog|license|authors|contributing)(\.\w+)?$|\.(md|mdx|rst|txt|adoc)$/i;

async function withinSizeLimit(octokit: Octokit, owner: string, repo: string, prNumber: number): Promise<boolean> {
  const { data } = await octokit.rest.pulls.get({ owner, repo, pull_number: prNumber });
  return data.changed_files <= MAX_FILES && data.additions + data.deletions <= MAX_CHANGED_LINES;
}

/** Per-hunk added-line ranges for one file's patch - a file with two unrelated hunks yields two separate ranges, never one span covering both. */
function hunkRanges(patch: string): { startLine: number; endLine: number }[] {
  return parseHunks(patch)
    .map(addedRange)
    .filter((r): r is { startLine: number; endLine: number } => r !== null);
}

/**
 * Tier 1: default-branch commits matching git's standard `Revert "..."` /
 * `This reverts commit <sha>.` shape. The reverted PR's own diff *is* the
 * ground truth directly - no blame/line-history walk needed. Highest
 * confidence: a revert is by definition an exact, known undo.
 */
export async function findRevertPairs(
  octokit: Octokit,
  owner: string,
  name: string,
  sinceSha: string | undefined,
): Promise<{ pairs: MinedPair[]; newestSha: string | undefined; commitsScanned: number }> {
  const commits = await octokit.paginate(octokit.rest.repos.listCommits, { owner, repo: name, per_page: 100 });
  const newestSha = commits[0]?.sha;
  const pairs: MinedPair[] = [];
  let commitsScanned = 0;

  for (const commit of commits) {
    if (sinceSha && commit.sha === sinceSha) break;
    commitsScanned += 1;

    const message = commit.commit.message;
    if (!REVERT_TITLE.test(message)) continue;
    const trailerMatch = REVERT_TRAILER.exec(message);
    const revertedSha = trailerMatch?.[1];
    if (!revertedSha) continue;

    const reverted = await resolveOwningPr(octokit, owner, name, revertedSha);
    if (reverted.status !== "resolved" || reverted.prNumber === undefined) continue;
    const fix = await resolveOwningPr(octokit, owner, name, commit.sha);
    if (fix.status !== "resolved" || fix.prNumber === undefined) continue;

    if (!(await withinSizeLimit(octokit, owner, name, reverted.prNumber))) continue;

    const { data: revertedFiles } = await octokit.rest.pulls.listFiles({
      owner,
      repo: name,
      pull_number: reverted.prNumber,
      per_page: 100,
    });

    const groundTruth = revertedFiles
      .filter((f) => f.patch && !NON_CODE_FILE.test(f.filename))
      .flatMap((f) => hunkRanges(f.patch!).map((range) => ({ file: f.filename, ...range })));

    if (groundTruth.length === 0) continue;

    pairs.push({
      id: `${owner}/${name}#${fix.prNumber}:revert:${reverted.prNumber}`,
      repo: `${owner}/${name}`,
      buggyPr: { number: reverted.prNumber, baseSha: reverted.baseSha!, headSha: reverted.headSha! },
      fixPr: { number: fix.prNumber },
      groundTruth,
      method: "revert",
      confidence: "high",
    });
  }

  return { pairs, newestSha, commitsScanned };
}

/**
 * Tier 2: merged PRs that look like a bug fix (keyword heuristic) AND
 * reference an issue via GitHub's auto-link keywords. For each hunk the fix
 * touches, `git log -L` finds the commit that last touched those lines
 * before the fix - the bug-introducing candidate. Medium confidence by
 * default (an issue link is decent but not certain evidence), downgraded to
 * needs-review on any ambiguity (rename boundary, no owning PR, multiple
 * owning PRs, or a multi-commit PR whose ground truth couldn't be uniquely
 * re-mapped by text).
 */
export type PrOutcome = "accepted" | "filtered" | "needs-review";

export async function findIssueLinkPairs(
  octokit: Octokit,
  repoDir: string,
  owner: string,
  name: string,
  afterPrNumber: number,
  alreadyProcessed: Set<number>,
  limit: number,
  onPrProcessed: (prNumber: number, outcome: PrOutcome) => void,
): Promise<{ pairs: MinedPair[]; prsScanned: number; lastPrNumber: number }> {
  const pairs: MinedPair[] = [];
  let prsScanned = 0;
  let lastPrNumber = afterPrNumber;

  const iterator = octokit.paginate.iterator(octokit.rest.pulls.list, {
    owner,
    repo: name,
    state: "closed",
    sort: "created",
    direction: "asc",
    per_page: 100,
  });

  outer: for await (const { data: page } of iterator) {
    for (const pr of page) {
      if (pr.number <= afterPrNumber || alreadyProcessed.has(pr.number)) continue;
      if (!pr.merged_at) {
        lastPrNumber = pr.number;
        continue;
      }
      if (prsScanned >= limit) break outer;
      prsScanned += 1;
      lastPrNumber = pr.number;

      const text = `${pr.title}\n${pr.body ?? ""}`;
      if (!FIX_KEYWORDS.test(text)) {
        onPrProcessed(pr.number, "filtered");
        continue;
      }
      if (![...text.matchAll(LINK_KEYWORDS)].length) {
        onPrProcessed(pr.number, "filtered"); // no link -> blame-only tier, excluded from this dataset
        continue;
      }

      if (!(await withinSizeLimit(octokit, owner, name, pr.number))) {
        onPrProcessed(pr.number, "filtered");
        continue;
      }

      const pairsForThisPr: MinedPair[] = [];
      const { data: files } = await octokit.rest.pulls.listFiles({ owner, repo: name, pull_number: pr.number, per_page: 100 });

      for (const file of files) {
        if (!file.patch || NON_CODE_FILE.test(file.filename)) continue;
        const ranges = hunkRanges(file.patch);

        for (const [hunkIndex, range] of ranges.entries()) {
          const idSuffix = ranges.length > 1 ? `${file.filename}:${hunkIndex}` : file.filename;

          const history = await lineHistory(repoDir, file.filename, range.startLine, range.endLine, pr.base.sha);
          if (history.length === 0) continue;
          const introducing = history[0]!;

          let confidence: PairConfidence = "medium";
          let note: string | undefined;
          if (introducing.looksLikeRename) {
            confidence = "needs-review";
            note = "introducing commit's diff shows a rename for this file - git log -L doesn't follow renames, so the true origin may be further back";
          }

          const owning = await resolveOwningPr(octokit, owner, name, introducing.sha);

          if (owning.status === "no-pr") {
            pairsForThisPr.push({
              id: `${owner}/${name}#${pr.number}:${idSuffix}`,
              repo: `${owner}/${name}`,
              buggyPr: { number: null, baseSha: `${introducing.sha}^`, headSha: introducing.sha },
              fixPr: { number: pr.number },
              groundTruth: [{ file: file.filename, ...range }],
              method: "issue-link",
              confidence: "needs-review",
              note: note ?? "introducing commit has no owning PR (direct push to default branch) - ground truth is that commit's own diff",
            });
            continue;
          }
          if (owning.status === "multiple-prs" || owning.prNumber === undefined) {
            pairsForThisPr.push({
              id: `${owner}/${name}#${pr.number}:${idSuffix}`,
              repo: `${owner}/${name}`,
              buggyPr: { number: null, baseSha: `${introducing.sha}^`, headSha: introducing.sha },
              fixPr: { number: pr.number },
              groundTruth: [{ file: file.filename, ...range }],
              method: "issue-link",
              confidence: "needs-review",
              note: note ?? "introducing commit is associated with more than one PR (backport/cherry-pick?)",
            });
            continue;
          }

          const gt = await deriveGroundTruth(
            octokit,
            owner,
            name,
            repoDir,
            introducing.sha,
            owning.prNumber,
            file.filename,
            range.startLine,
            range.endLine,
          );
          if (gt.ranges.length === 0) continue;

          pairsForThisPr.push({
            id: `${owner}/${name}#${pr.number}:${idSuffix}`,
            repo: `${owner}/${name}`,
            buggyPr: { number: owning.prNumber, baseSha: owning.baseSha!, headSha: owning.headSha! },
            fixPr: { number: pr.number },
            groundTruth: gt.ranges,
            method: "issue-link",
            confidence: confidence === "needs-review" ? "needs-review" : gt.confidence,
            note: note ?? gt.note,
          });
        }
      }

      pairs.push(...pairsForThisPr);
      if (pairsForThisPr.length === 0) {
        onPrProcessed(pr.number, "filtered");
      } else if (pairsForThisPr.every((p) => p.confidence === "needs-review")) {
        onPrProcessed(pr.number, "needs-review");
      } else {
        onPrProcessed(pr.number, "accepted");
      }
    }
  }

  return { pairs, prsScanned, lastPrNumber };
}
