import type { Finding } from "./schema.js";
import type { SkippedFile } from "./diffFilter.js";

export interface InlineComment {
  path: string;
  line: number;
  side: "RIGHT";
  body: string;
}

export interface FormattedReview {
  inlineComments: InlineComment[];
  body: string;
}

const SEVERITY_EMOJI: Record<string, string> = {
  critical: "🔴",
  high: "🟠",
  medium: "🟡",
  low: "⚪",
};

function formatFindingBody(finding: Finding): string {
  const emoji = SEVERITY_EMOJI[finding.severity] ?? "";
  const lines = [
    `${emoji} **${finding.severity.toUpperCase()} / ${finding.category}** (confidence: ${finding.confidence.toFixed(2)})`,
    "",
    finding.explanation,
  ];
  if (finding.suggested_fix) {
    lines.push("", `**Suggested fix:** ${finding.suggested_fix}`);
  }
  return lines.join("\n");
}

/**
 * Splits findings into inline PR comments (only for file+line combinations
 * that actually exist in the diff) and a review-body section for everything
 * else, so GitHub's review API never rejects the review for pointing at a
 * line outside the diff.
 */
export function formatReview(
  findings: Finding[],
  diffLineMap: Map<string, Set<number>>,
  skipped: SkippedFile[],
  failed: boolean,
): FormattedReview {
  const inlineComments: InlineComment[] = [];
  const outOfDiffFindings: Finding[] = [];

  for (const finding of findings) {
    const validLines = diffLineMap.get(finding.file);
    if (validLines?.has(finding.line)) {
      inlineComments.push({
        path: finding.file,
        line: finding.line,
        side: "RIGHT",
        body: formatFindingBody(finding),
      });
    } else {
      outOfDiffFindings.push(finding);
    }
  }

  const bodyParts: string[] = ["## PRLens diff-only review"];

  if (failed) {
    bodyParts.push("⚠️ The review model did not return a valid response for this PR. No findings were generated.");
  } else if (findings.length === 0) {
    bodyParts.push("No issues found.");
  } else {
    bodyParts.push(
      `Found ${findings.length} issue(s): ${inlineComments.length} posted inline, ${outOfDiffFindings.length} listed below (outside the diff's commentable lines).`,
    );
  }

  if (outOfDiffFindings.length > 0) {
    bodyParts.push(
      "### Additional findings",
      ...outOfDiffFindings.map((f) => `- **${f.file}:${f.line}** ${formatFindingBody(f).replace(/\n/g, " ")}`),
    );
  }

  if (skipped.length > 0) {
    bodyParts.push(
      "### Skipped files",
      ...skipped.map((s) => `- \`${s.filename}\` (${s.reason})`),
    );
  }

  return { inlineComments, body: bodyParts.join("\n\n") };
}
