import type { IncludedFile, SkippedFile } from "./diffFilter.js";

export function buildDiffText(files: IncludedFile[], skipped: SkippedFile[]): string {
  const sections = files.map(
    (file) => `## File: ${file.filename} (${file.status})\n\`\`\`diff\n${file.patch}\n\`\`\``,
  );

  let text = sections.join("\n\n");

  if (skipped.length > 0) {
    const skipNote = skipped.map((s) => `- ${s.filename} (${s.reason})`).join("\n");
    text += `\n\n## Note\nThe following files were not included above and should not be reviewed (you have no visibility into their contents):\n${skipNote}`;
  }

  return text;
}
