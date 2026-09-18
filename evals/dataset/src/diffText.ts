export interface DiffLine {
  line: number;
  text: string;
}

const HUNK_HEADER = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

/**
 * Parses a single-file unified diff (a GitHub `pulls.listFiles` `.patch`
 * value, or `git show`/`git log -L` output for one path) into its added and
 * unchanged-context lines, keyed by post-image (new file) line number. Any
 * `--- a/...`/`+++ b/...` header lines are naturally skipped since they
 * appear before the first `@@` hunk header sets the parser's in-hunk state.
 */
export function parseHunkLines(patch: string): DiffLine[] {
  const lines: DiffLine[] = [];
  let newLine = 0;
  let inHunk = false;

  for (const rawLine of patch.split("\n")) {
    const hunkMatch = HUNK_HEADER.exec(rawLine);
    if (hunkMatch) {
      newLine = Number(hunkMatch[1]);
      inHunk = true;
      continue;
    }
    if (!inHunk) continue;

    const marker = rawLine[0];
    if (marker === "+") {
      lines.push({ line: newLine, text: rawLine.slice(1) });
      newLine += 1;
    } else if (marker === " ") {
      lines.push({ line: newLine, text: rawLine.slice(1) });
      newLine += 1;
    }
    // '-' (deleted) and '\' (no-newline marker) have no post-image line.
  }

  return lines;
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
