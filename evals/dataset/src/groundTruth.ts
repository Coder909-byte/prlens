import type { Octokit } from "octokit";
import { showCommitFilePatch } from "./clone.js";
import { addedRange, findUniqueLineByText, parseHunkLines, parseHunks } from "./diffText.js";
import type { GroundTruthRange, PairConfidence } from "./types.js";

export interface ResolvedIntroducingCommit {
  status: "resolved" | "no-pr" | "multiple-prs";
  prNumber?: number;
  baseSha?: string;
  headSha?: string;
}

/** Which (merged) PR a commit belongs to, if any. */
export async function resolveOwningPr(
  octokit: Octokit,
  owner: string,
  repo: string,
  sha: string,
): Promise<ResolvedIntroducingCommit> {
  const { data: prs } = await octokit.rest.repos.listPullRequestsAssociatedWithCommit({ owner, repo, commit_sha: sha });
  const merged = prs.filter((pr) => pr.merged_at);
  if (merged.length === 0) return { status: "no-pr" };
  if (merged.length > 1) return { status: "multiple-prs" };
  const pr = merged[0]!;
  return { status: "resolved", prNumber: pr.number, baseSha: pr.base.sha, headSha: pr.head.sha };
}

export interface GroundTruthResult {
  ranges: GroundTruthRange[];
  confidence: PairConfidence;
  note?: string;
}

/**
 * A "sole commit" introducing PR is trusted at high confidence because its
 * own hunk normally *is* the fix's own line range - but when that commit is
 * a bulk addition (e.g. a large block of new tests added in one commit),
 * `git log -L` on a single later-changed line still resolves to that whole
 * hunk, since every line in it shares the same introducing commit. A 20+
 * line "ground truth" is too coarse for the ±5 line scoring window to mean
 * anything, so it gets downgraded rather than trusted at face value.
 */
const MAX_TRUSTED_RANGE_WIDTH = 15;

function finalize(ranges: GroundTruthRange[], confidence: PairConfidence, note?: string): GroundTruthResult {
  const tooWide = ranges.some((r) => r.endLine - r.startLine + 1 > MAX_TRUSTED_RANGE_WIDTH);
  if (tooWide && confidence !== "needs-review") {
    return {
      ranges,
      confidence: "needs-review",
      note: `introducing commit's matching hunk is ${MAX_TRUSTED_RANGE_WIDTH}+ lines wide (likely a bulk change) - too coarse to trust as a precise bug location`,
    };
  }
  return { ranges, confidence, note };
}

/**
 * Derives the ground-truth line range for introducing commit `sha`, in
 * terms of the line numbers the SCORING HARNESS will actually see - the
 * owning PR's overall base->head diff via `pulls.listFiles` - not
 * necessarily `sha`'s own line numbers, which only coincide when `sha` is
 * the sole commit in that PR. When it isn't, other commits in the same PR
 * may have shifted line numbers around the buggy lines, so this re-locates
 * the buggy lines in the PR-level diff by matching their exact text rather
 * than trusting `sha`'s own numbers.
 *
 * Only ADDED lines within the one hunk that overlaps the candidate range
 * become the ground truth - not the whole hunk's span including surrounding
 * unchanged context, and not other unrelated hunks in the same file's patch.
 */
export async function deriveGroundTruth(
  octokit: Octokit,
  owner: string,
  repo: string,
  repoDir: string,
  introducingSha: string,
  prNumber: number,
  path: string,
  candidateStartLine: number,
  candidateEndLine: number,
): Promise<GroundTruthResult> {
  const commits = await octokit.paginate(octokit.rest.pulls.listCommits, {
    owner,
    repo,
    pull_number: prNumber,
    per_page: 100,
  });
  const soleCommit = commits.length === 1 && commits[0]?.sha === introducingSha;

  const patch = await showCommitFilePatch(repoDir, introducingSha, path);
  const matchingHunk = parseHunks(patch).find((hunk) => {
    const range = addedRange(hunk);
    return range !== null && range.startLine <= candidateEndLine && range.endLine >= candidateStartLine;
  });

  if (!matchingHunk) {
    return {
      ranges: [],
      confidence: "needs-review",
      note: "could not find a hunk in the introducing commit's own diff overlapping the candidate range",
    };
  }
  const introRange = addedRange(matchingHunk)!;

  if (soleCommit) {
    return finalize([{ file: path, ...introRange }], "high");
  }

  // Multiple commits in the introducing PR touch history for this file -
  // introRange's line numbers may not match the PR's overall diff.
  // Re-locate by matching text content instead of trusting those numbers.
  const { data: prFiles } = await octokit.rest.pulls.listFiles({ owner, repo, pull_number: prNumber, per_page: 100 });
  const prFile = prFiles.find((f) => f.filename === path);
  if (!prFile?.patch) {
    return {
      ranges: [{ file: path, ...introRange }],
      confidence: "needs-review",
      note: "multi-commit PR; file not found in the PR-level diff",
    };
  }
  const prLines = parseHunkLines(prFile.patch);

  const mappedLines: number[] = [];
  for (const introLine of matchingHunk.filter((l) => l.kind === "added")) {
    const mapped = findUniqueLineByText(prLines, introLine.text);
    if (mapped === null) {
      return {
        ranges: [{ file: path, ...introRange }],
        confidence: "needs-review",
        note: "multi-commit PR; could not uniquely re-map the introducing commit's lines to the PR's overall diff by text",
      };
    }
    mappedLines.push(mapped);
  }

  return finalize(
    [{ file: path, startLine: Math.min(...mappedLines), endLine: Math.max(...mappedLines) }],
    "medium",
    "multi-commit PR; ground truth re-mapped from the introducing commit to the PR's overall diff by matching line text",
  );
}
