const HUNK_HEADER = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

/**
 * Parses a unified diff patch (as returned per-file by GitHub's
 * pulls.listFiles) and returns the set of line numbers on the RIGHT side
 * (the new/current version of the file) that GitHub will accept an inline
 * review comment on - i.e. every added or unchanged-context line inside a
 * hunk. Deleted lines have no right-side line number and are excluded.
 *
 * We only support RIGHT-side (new-file) comments in M1 - findings that map
 * to a line that only existed in the old file have no valid anchor here and
 * must go in the review body instead.
 */
export function parseDiffHunks(patch: string | null | undefined): Set<number> {
  const validLines = new Set<number>();
  if (!patch) return validLines;

  let newLine = 0;
  let inHunk = false;

  for (const rawLine of patch.split("\n")) {
    const headerMatch = HUNK_HEADER.exec(rawLine);
    if (headerMatch) {
      newLine = Number(headerMatch[1]);
      inHunk = true;
      continue;
    }
    if (!inHunk) continue;

    const marker = rawLine[0];
    if (marker === "+") {
      validLines.add(newLine);
      newLine += 1;
    } else if (marker === " ") {
      validLines.add(newLine);
      newLine += 1;
    } else if (marker === "-") {
      // Deleted line: exists only on the left (old) side, no right-side line number.
    } else if (marker === "\\") {
      // e.g. "\ No newline at end of file" - not a content line.
    }
    // A blank rawLine (marker undefined) shouldn't occur mid-hunk in a
    // well-formed patch; ignore defensively rather than throw.
  }

  return validLines;
}
