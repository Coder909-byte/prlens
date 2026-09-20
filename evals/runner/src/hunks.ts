import type { Hunk } from "@prlens/indexer";
import type { IncludedFile } from "@prlens/reviewer";

const HUNK_HEADER = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

/** One Hunk per `@@ ... @@` block per file - the new-side line range covering every added/context line in it (mirrors packages/reviewer/src/diffLines.ts's line-validity logic, but keeps the range shape retrieveContext needs instead of a flat line set). */
export function extractHunks(files: IncludedFile[]): Hunk[] {
  const hunks: Hunk[] = [];

  for (const file of files) {
    let newLine = 0;
    let hunkStart: number | null = null;
    let hunkEnd: number | null = null;

    function flush(): void {
      if (hunkStart !== null && hunkEnd !== null) hunks.push({ file: file.filename, startLine: hunkStart, endLine: hunkEnd });
      hunkStart = null;
      hunkEnd = null;
    }

    for (const raw of file.patch.split("\n")) {
      const headerMatch = HUNK_HEADER.exec(raw);
      if (headerMatch) {
        flush();
        newLine = Number(headerMatch[1]);
        continue;
      }
      const marker = raw.charAt(0);
      if (marker === "+" || marker === " ") {
        if (hunkStart === null) hunkStart = newLine;
        hunkEnd = newLine;
        newLine++;
      }
      // '-' (deleted) doesn't exist on the new side - no line advance, doesn't extend the range.
    }
    flush();
  }

  return hunks;
}
