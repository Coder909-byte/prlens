import type { Octokit } from "octokit";
import { lineHistory } from "./clone.js";
import { addedRange, parseHunks } from "./diffText.js";
import { deriveGroundTruth, resolveOwningPr } from "./groundTruth.js";
import type { MinedPair, PairConfidence, PairSummary } from "./types.js";

const FIX_KEYWORDS = /\b(fix|fixes|fixed|bug|crash|incorrect|wrong|regression)\b/i;
const LINK_KEYWORDS = /\b(?:fixes?|closes?|resolves?)\s+#(\d+)/gi;
const REVERT_TITLE = /^Revert "/;
const REVERT_TRAILER = /This reverts commit ([0-9a-f]{40})/;

// A PR titled "Add X" that happens to close a feature-request issue with
// "fixes #N" (GitHub's auto-link keywords work on any linked issue, not
// just bugs) is a feature addition, not a bug fix - the body/issue link
// alone isn't enough evidence, so the bug signal must be in the PR's own
// title, and a feature-shaped title is disqualifying even then.
const FEATURE_TITLE_PREFIX = /^(add|implement|support|introduce)\b/i;

export function looksLikeBugFixTitle(title: string): boolean {
  return FIX_KEYWORDS.test(title) && !FEATURE_TITLE_PREFIX.test(title.trim());
}

const BUG_LABEL = /bug/i;
const NON_BUG_LABEL = /^(enhancement|feature|feature[- ]request|question|discussion)$/i;

// Looser than FIX_KEYWORDS on purpose - it's a corroborating signal on the
// LINKED ISSUE's own title, only consulted when the fix PR's title is
// neutral (no fix keyword, but also no feature-prefix rejection). Deliberately
// no \b around "error"/"crash": a real-world example, got#172, linked an
// issue titled "ParseError on response with no body" - a compound identifier,
// not the standalone word "error".
const ISSUE_BUG_SIGNAL = /error|crash|exception|fail|broken|incorrect|wrong|regression|\bbug\b/i;

/**
 * A fix PR is often titled descriptively ("Parse the response body only if
 * it is not empty") rather than with fix/bug wording, even for a genuine
 * bug. Requiring FIX_KEYWORDS in the title alone (the original rule) drops
 * those - so a NEUTRAL title (no fix keyword, but not feature-prefixed
 * either) still passes if the linked issue itself carries a bug signal
 * (title wording or a "bug" label). A feature-prefixed title
 * (Add/Implement/Support/Introduce) is rejected unconditionally, per
 * instruction, regardless of what the linked issue says.
 */
export function looksLikeBugFix(prTitle: string, linkedIssue: LinkedIssue | undefined): boolean {
  const title = prTitle.trim();
  if (FEATURE_TITLE_PREFIX.test(title)) return false;
  if (FIX_KEYWORDS.test(title)) return true;
  if (!linkedIssue) return false;
  return linkedIssue.labels.some((l) => BUG_LABEL.test(l)) || ISSUE_BUG_SIGNAL.test(linkedIssue.title);
}

const MAX_FILES = 3;
const MAX_CHANGED_LINES = 50;

// A "fix" to one of these isn't a code bug a diff-only reviewer would ever
// be asked to catch - seen in practice: a got PR fixing a typo in
// readme.md matched the fix-keyword heuristic and produced a ground-truth
// candidate that made no sense as a benchmark case.
export const NON_CODE_FILE = /(^|\/)(readme|changelog|license|authors|contributing)(\.\w+)?$|\.(md|mdx|rst|txt|adoc)$/i;

// CI pipeline definitions - a "fix" here is a build/credentials/workflow
// change, not something a code reviewer looking at application logic would
// ever be positioned to catch.
export const CI_CONFIG_FILE =
  /(^|\/)\.github\/workflows\/.+\.ya?ml$|(^|\/)(\.travis\.yml|\.gitlab-ci\.yml|appveyor\.yml|azure-pipelines\.yml|karma\.conf\.js)$|(^|\/)\.circleci\/config\.ya?ml$/i;

// Dependency manifests/lockfiles - a version bump or dependency swap, not a
// logic bug in the reviewed code.
export const PACKAGE_MANIFEST_FILE =
  /(^|\/)(package(-lock)?\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.ya?ml|Pipfile(\.lock)?|poetry\.lock)$/i;

// Test/spec files - ground truth here means the bug lived in the test, not
// the source it exercises. Excluded as a GROUND-TRUTH location (a pair
// entirely within test files is dropped), but test files are still fine to
// appear in the surrounding diff a reviewer sees.
export const TEST_FILE =
  /(^|\/)(tests?|specs?|__tests__)\/|(^|\/)[^/]*\.(spec|test)\.[jt]sx?$|(^|\/)test_[^/]*\.py$|(^|\/)(test|tests|spec|specs)\.(js|jsx|ts|tsx|py)$|(^|\/)conftest\.py$/i;

// Documentation-site templates - e.g. Sphinx's docs/_templates/*.html -
// seen in practice (psf/requests#6612): a sidebar template edit, not
// application code a reviewer would ever be positioned to catch.
export const DOC_TEMPLATE_FILE = /(^|\/)docs?\/.*\.html?$|(^|\/)_?templates?\/.*\.html?$/i;

/** Whether `filename` is a legitimate ground-truth location for a benchmark bug - excludes docs (including doc-site templates), CI config, package manifests/lockfiles, and test/spec files. */
export function isReviewableGroundTruthFile(filename: string): boolean {
  return (
    !NON_CODE_FILE.test(filename) &&
    !CI_CONFIG_FILE.test(filename) &&
    !PACKAGE_MANIFEST_FILE.test(filename) &&
    !TEST_FILE.test(filename) &&
    !DOC_TEMPLATE_FILE.test(filename)
  );
}

async function withinSizeLimit(octokit: Octokit, owner: string, repo: string, prNumber: number): Promise<boolean> {
  const { data } = await octokit.rest.pulls.get({ owner, repo, pull_number: prNumber });
  return data.changed_files <= MAX_FILES && data.additions + data.deletions <= MAX_CHANGED_LINES;
}

export interface LinkedIssue {
  title: string;
  labels: string[];
}

/** Best-effort issue lookup for a "fixes #N" reference - never throws, since #N can be a PR, a cross-repo reference gone wrong, or deleted. */
export async function resolveLinkedIssue(octokit: Octokit, owner: string, repo: string, text: string): Promise<LinkedIssue | undefined> {
  const match = LINK_KEYWORDS.exec(text);
  LINK_KEYWORDS.lastIndex = 0; // the regex has the global flag - reset shared state between calls
  const issueNumber = match?.[1] ? Number(match[1]) : undefined;
  if (issueNumber === undefined) return undefined;
  try {
    const { data } = await octokit.rest.issues.get({ owner, repo, issue_number: issueNumber });
    const labels = (data.labels ?? []).map((l) => (typeof l === "string" ? l : (l.name ?? ""))).filter(Boolean);
    return { title: data.title, labels };
  } catch {
    return undefined;
  }
}

/** True only when the linked issue's own labels actively contradict a bug-fix framing (e.g. "enhancement" with no "bug" label) - absent or unlabeled issues pass through, since labels are "where available" evidence, not a requirement. */
export function labelsContradictBugFix(issue: LinkedIssue | undefined): boolean {
  if (!issue || issue.labels.length === 0) return false;
  return !issue.labels.some((l) => BUG_LABEL.test(l)) && issue.labels.some((l) => NON_BUG_LABEL.test(l));
}

/** Mechanical, unverified: the fix PR's own title plus (when resolvable) the title of the issue it says it fixes. Never an LLM call, never checked against the actual diff. */
function buildSummary(fixTitle: string, issue: LinkedIssue | undefined): PairSummary {
  return { fixSummary: fixTitle, issueSummary: issue?.title };
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
    // The revert commit and the commit it reverts resolving to the same PR
    // means a PR reverted its own in-progress work before merging - not a
    // historical bug that shipped and was later fixed.
    if (reverted.prNumber === fix.prNumber) continue;

    if (!(await withinSizeLimit(octokit, owner, name, reverted.prNumber))) continue;

    const { data: revertedFiles } = await octokit.rest.pulls.listFiles({
      owner,
      repo: name,
      pull_number: reverted.prNumber,
      per_page: 100,
    });

    const groundTruth = revertedFiles
      .filter((f) => f.patch && isReviewableGroundTruthFile(f.filename))
      .flatMap((f) => hunkRanges(f.patch!).map((range) => ({ file: f.filename, ...range })));

    if (groundTruth.length === 0) continue;

    const { data: fixPrData } = await octokit.rest.pulls.get({ owner, repo: name, pull_number: fix.prNumber });
    const linkedIssue = await resolveLinkedIssue(octokit, owner, name, `${fixPrData.title}\n${fixPrData.body ?? ""}`);
    const summary = buildSummary(fixPrData.title, linkedIssue);

    pairs.push({
      id: `${owner}/${name}#${fix.prNumber}:revert:${reverted.prNumber}`,
      repo: `${owner}/${name}`,
      buggyPr: { number: reverted.prNumber, baseSha: reverted.baseSha!, headSha: reverted.headSha! },
      fixPr: { number: fix.prNumber },
      groundTruth,
      method: "revert",
      confidence: "high",
      summary,
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
  onPrProcessed: (prNumber: number, outcome: PrOutcome, pairs: MinedPair[]) => void,
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
      // A feature-shaped title (Add/Implement/Support/Introduce) disqualifies
      // outright - a feature PR's body commonly says "fixes #N" when it
      // closes a feature-request issue, which isn't a bug fix, and no linked
      // issue evidence overrides this.
      if (FEATURE_TITLE_PREFIX.test(pr.title.trim())) {
        onPrProcessed(pr.number, "filtered", []);
        continue;
      }
      if (![...text.matchAll(LINK_KEYWORDS)].length) {
        onPrProcessed(pr.number, "filtered", []); // no link -> blame-only tier, excluded from this dataset
        continue;
      }

      if (!(await withinSizeLimit(octokit, owner, name, pr.number))) {
        onPrProcessed(pr.number, "filtered", []);
        continue;
      }

      // The bug signal must be in the PR's own title OR (for a title that's
      // neutral rather than feature-shaped) corroborated by the linked
      // issue's own title/label - a fix PR titled purely descriptively
      // ("Parse the response body only if it is not empty") still counts
      // when the issue it closes reads as a real bug ("ParseError on
      // response with no body").
      const linkedIssue = await resolveLinkedIssue(octokit, owner, name, text);
      if (!looksLikeBugFix(pr.title, linkedIssue)) {
        onPrProcessed(pr.number, "filtered", []);
        continue;
      }
      if (labelsContradictBugFix(linkedIssue)) {
        onPrProcessed(pr.number, "filtered", []); // linked issue is labeled enhancement/feature/etc with no "bug" label
        continue;
      }

      const pairsForThisPr: MinedPair[] = [];
      const summary = buildSummary(pr.title, linkedIssue);
      const { data: files } = await octokit.rest.pulls.listFiles({ owner, repo: name, pull_number: pr.number, per_page: 100 });

      for (const file of files) {
        if (!file.patch || !isReviewableGroundTruthFile(file.filename)) continue;
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
              summary,
            });
            continue;
          }
          if (owning.status === "multiple-prs" || owning.status === "not-found" || owning.prNumber === undefined) {
            pairsForThisPr.push({
              id: `${owner}/${name}#${pr.number}:${idSuffix}`,
              repo: `${owner}/${name}`,
              buggyPr: { number: null, baseSha: `${introducing.sha}^`, headSha: introducing.sha },
              fixPr: { number: pr.number },
              groundTruth: [{ file: file.filename, ...range }],
              method: "issue-link",
              confidence: "needs-review",
              note:
                note ??
                (owning.status === "not-found"
                  ? "introducing commit's SHA could not be resolved by GitHub's API (dangling after a history rewrite?) - ground truth is that commit's own diff"
                  : "introducing commit is associated with more than one PR (backport/cherry-pick?)"),
              summary,
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
            summary,
          });
        }
      }

      pairs.push(...pairsForThisPr);
      if (pairsForThisPr.length === 0) {
        onPrProcessed(pr.number, "filtered", pairsForThisPr);
      } else if (pairsForThisPr.every((p) => p.confidence === "needs-review")) {
        onPrProcessed(pr.number, "needs-review", pairsForThisPr);
      } else {
        onPrProcessed(pr.number, "accepted", pairsForThisPr);
      }
    }
  }

  return { pairs, prsScanned, lastPrNumber };
}
