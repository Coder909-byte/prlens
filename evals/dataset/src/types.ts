export interface RepoRef {
  owner: string;
  name: string;
}

export function repoKey(repo: RepoRef): string {
  return `${repo.owner}__${repo.name}`;
}

export function repoSlug(repo: RepoRef): string {
  return `${repo.owner}/${repo.name}`;
}

export interface GroundTruthRange {
  file: string;
  startLine: number;
  endLine: number;
}

export type PairMethod = "revert" | "issue-link";
export type PairConfidence = "high" | "medium" | "needs-review";

/**
 * Mechanically pulled from PR/issue titles - never LLM-generated, never
 * verified against the actual diff. The review UI must label this
 * unverified: a PR title can describe something other than what its diff
 * actually does, and the linked issue isn't always precisely what the fix
 * addresses.
 */
export interface PairSummary {
  /** The fix PR's own title. */
  fixSummary: string;
  /** The linked issue's title, when the fix PR references one resolvably (e.g. "fixes #172"). */
  issueSummary?: string;
}

export interface MinedPair {
  /** Stable id: `${owner}/${name}#${fixPrNumber}:${index}` - unique even when one fix PR yields multiple ground-truth ranges. */
  id: string;
  repo: string;
  buggyPr: { number: number | null; baseSha: string; headSha: string };
  fixPr: { number: number };
  groundTruth: GroundTruthRange[];
  method: PairMethod;
  confidence: PairConfidence;
  /** Why this is needs-review, or any other note worth keeping - e.g. "multi-commit PR, matched by text" or "possible rename boundary". */
  note?: string;
  summary?: PairSummary;
  /**
   * Set when the introducing diff couldn't be recovered through the same
   * path the scoring harness will use (the owning PR's `pulls.listFiles`,
   * or - for a PR-less direct push - the commit's own diff): GitHub omits
   * `patch` for very large or binary file diffs. Unusable for scoring, so
   * excluded from the review docket rather than surfaced for a verdict.
   */
  unusable?: { reason: string };
}

export interface PilotStats {
  repo: string;
  candidatesFound: number;
  byMethod: Record<PairMethod, number>;
  byConfidence: Record<PairConfidence, number>;
  prsScanned: number;
  apiCallsUsed: number;
  wallClockMs: number;
}
