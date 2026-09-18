import type { Octokit } from "octokit";
import { showCommitFilePatch } from "./clone.js";
import { findUniqueLineByText, parseHunkLines } from "./diffText.js";
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
 * Derives the ground-truth line range for introducing commit `sha`, in
 * terms of the line numbers the SCORING HARNESS will actually see - the
 * owning PR's overall base->head diff via `pulls.listFiles` - not
 * necessarily `sha`'s own line numbers, which only coincide when `sha` is
 * the sole commit in that PR. When it isn't, other commits in the same PR
 * may have shifted line numbers around the buggy lines, so this re-locates
 * the buggy lines in the PR-level diff by matching their exact text rather
 * than trusting `sha`'s own numbers.
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
  const introducingLines = parseHunkLines(patch).filter(
    (l) => l.line >= candidateStartLine && l.line <= candidateEndLine,
  );

  if (introducingLines.length === 0) {
    return { ranges: [], confidence: "needs-review", note: "could not extract the introducing commit's own hunk text" };
  }

  if (soleCommit) {
    return {
      ranges: [{ file: path, startLine: candidateStartLine, endLine: candidateEndLine }],
      confidence: "high",
    };
  }

  const { data: prFiles } = await octokit.rest.pulls.listFiles({ owner, repo, pull_number: prNumber, per_page: 100 });
  const prFile = prFiles.find((f) => f.filename === path);
  if (!prFile?.patch) {
    return { ranges: [], confidence: "needs-review", note: "multi-commit PR; file not found in the PR-level diff" };
  }
  const prLines = parseHunkLines(prFile.patch);

  const mappedLines: number[] = [];
  for (const introLine of introducingLines) {
    const mapped = findUniqueLineByText(prLines, introLine.text);
    if (mapped === null) {
      return {
        ranges: [{ file: path, startLine: candidateStartLine, endLine: candidateEndLine }],
        confidence: "needs-review",
        note: "multi-commit PR; could not uniquely re-map the introducing commit's lines to the PR's overall diff by text",
      };
    }
    mappedLines.push(mapped);
  }

  return {
    ranges: [{ file: path, startLine: Math.min(...mappedLines), endLine: Math.max(...mappedLines) }],
    confidence: "medium",
    note: "multi-commit PR; ground truth re-mapped from the introducing commit to the PR's overall diff by matching line text",
  };
}
