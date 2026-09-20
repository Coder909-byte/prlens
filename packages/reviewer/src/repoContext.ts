import type { RetrievedContext } from "@prlens/indexer";

function fence(language: string, text: string): string {
  return `\`\`\`${language}\n${text}\n\`\`\``;
}

/**
 * Formats retrieved context into a clearly separated prompt section - kept
 * apart from the diff text (buildDiffText) so the model can distinguish
 * "the actual change" from "automatically retrieved, possibly wrong"
 * background. Symbol-based retrieval only (no embeddings/type info), so
 * this is explicitly labeled unreliable, matching how the mined dataset's
 * own pair summaries are labeled "unverified" for the same reason.
 */
export function buildRepoContextText(contexts: RetrievedContext[]): string {
  const withContent = contexts.filter((c) => c.changedSymbol && c.items.length > 0);
  if (withContent.length === 0) return "";

  const sections = withContent.map((c) => {
    const header = `### \`${c.hunk.file}\` (lines ${c.hunk.startLine}-${c.hunk.endLine}), changed symbol: \`${c.changedSymbol!.name}\` (${c.changedSymbol!.kind})`;
    const parts: string[] = [header];

    const callees = c.items.filter((i) => i.kind === "callee-def");
    if (callees.length > 0) {
      parts.push("**Called by the changed code:**");
      for (const item of callees) parts.push(`\`${item.file}:${item.startLine}\`\n${fence("", item.snippet)}`);
    }

    const callers = c.items.filter((i) => i.kind === "caller");
    if (callers.length > 0) {
      parts.push("**Callers of the changed code:**");
      for (const item of callers) parts.push(`\`${item.file}:${item.startLine}\`\n${fence("", item.snippet)}`);
    }

    const tests = c.items.filter((i) => i.kind === "test-reference");
    if (tests.length > 0) {
      parts.push("**Referenced in tests:**");
      for (const item of tests) parts.push(`\`${item.file}\`\n${fence("", item.snippet)}`);
    }

    if (c.truncated) parts.push("_(more context was available but omitted - token budget reached)_");

    return parts.join("\n\n");
  });

  return (
    "## Repository Context (retrieved, may be incomplete)\n\n" +
    "Automatically retrieved from the repository to help review the change above. This is symbol-based retrieval (no semantic/type analysis) and may be incomplete, imprecise, or miss relevant code entirely - treat it as a hint, not ground truth.\n\n" +
    sections.join("\n\n")
  );
}
