export interface DiffLine {
  line: number;
  text: string;
  kind: "added" | "context";
}

const HUNK_HEADER = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

/**
 * Parses a single-file unified diff (a GitHub `pulls.listFiles` `.patch`
 * value, or `git show`/`git log -L` output for one path) into its hunks,
 * each an array of added and unchanged-context lines keyed by post-image
 * (new file) line number. Any `--- a/...`/`+++ b/...` header lines are
 * naturally skipped since they appear before the first `@@` hunk header
 * sets the parser's in-hunk state.
 *
 * Hunks are kept separate rather than flattened into one array - a file
 * with two unrelated small hunks (e.g. two separate one-line fixes) must not
 * be treated as one range spanning both, which would make the ground truth
 * far wider than the actual change.
 */
export function parseHunks(patch: string): DiffLine[][] {
  const hunks: DiffLine[][] = [];
  let current: DiffLine[] | undefined;
  let newLine = 0;

  for (const rawLine of patch.split("\n")) {
    const hunkMatch = HUNK_HEADER.exec(rawLine);
    if (hunkMatch) {
      newLine = Number(hunkMatch[1]);
      current = [];
      hunks.push(current);
      continue;
    }
    if (!current) continue;

    const marker = rawLine[0];
    if (marker === "+") {
      current.push({ line: newLine, text: rawLine.slice(1), kind: "added" });
      newLine += 1;
    } else if (marker === " ") {
      current.push({ line: newLine, text: rawLine.slice(1), kind: "context" });
      newLine += 1;
    }
    // '-' (deleted) and '\' (no-newline marker) have no post-image line.
  }

  return hunks;
}

/** Flattened view of every hunk's lines - for text-matching against a whole file's diff, where hunk boundaries don't matter. */
export function parseHunkLines(patch: string): DiffLine[] {
  return parseHunks(patch).flat();
}

/**
 * The line range actually worth recording as "the bug is here" - only the
 * ADDED lines (what changed), not the surrounding unchanged context a hunk
 * includes for readability. Returns null for a hunk with no added lines
 * (pure deletion - nothing to anchor a ground-truth line to).
 */
export function addedRange(hunkLines: DiffLine[]): { startLine: number; endLine: number } | null {
  const added = hunkLines.filter((l) => l.kind === "added").map((l) => l.line);
  if (added.length === 0) return null;
  return { startLine: Math.min(...added), endLine: Math.max(...added) };
}

/**
 * Finds where `text` (from another commit's hunk) lands in `lines` (a
 * different diff's parsed lines for the same file). Returns null if the text
 * doesn't appear, or appears more than once (ambiguous - caller should treat
 * as needs-review rather than guess).
 */
export function findUniqueLineByText(lines: DiffLine[], text: string): number | null {
  const matches = lines.filter((l) => l.text === text);
  if (matches.length !== 1) return null;
  return matches[0]?.line ?? null;
}
