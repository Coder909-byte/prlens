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
