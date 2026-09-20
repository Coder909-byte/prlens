import type { CodeSymbol, RepoIndex } from "./types.js";

export interface Hunk {
  file: string;
  startLine: number;
  endLine: number;
}

export type RetrievedItemKind = "callee-def" | "caller" | "test-reference";

export interface RetrievedItem {
  kind: RetrievedItemKind;
  file: string;
  name: string;
  startLine?: number;
  endLine?: number;
  snippet: string;
  approxTokens: number;
}

export interface RetrievedContext {
  hunk: Hunk;
  /** The symbol the hunk falls inside, if the indexer found one at base SHA - null for a hunk that's entirely new code (e.g. a brand-new function). */
  changedSymbol: { name: string; kind: string } | null;
  items: RetrievedItem[];
  /** True if the token budget was hit before every candidate could be included - always reported, since it's exactly what tells you retrieval, not the model, is why some context is missing. */
  truncated: boolean;
}

/** chars/4 - a documented estimate, not a real tokenizer, but good enough for a budget cap. */
function approxTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function smallestOverlapping(symbols: CodeSymbol[], hunk: Hunk): CodeSymbol | null {
  let best: CodeSymbol | null = null;
  for (const s of symbols) {
    if (s.file !== hunk.file) continue;
    if (s.startLine > hunk.endLine || s.endLine < hunk.startLine) continue;
    if (!best || s.endLine - s.startLine < best.endLine - best.startLine) best = s;
  }
  return best;
}

const MAX_TEST_FILE_MATCHES = 3;
const TEST_SNIPPET_CONTEXT_LINES = 3;

/** Lines around each occurrence of `name` in `content` (as a whole word), so the retrieved test context is a snippet, not the entire file. */
function testSnippet(content: string, name: string): string | null {
  const lines = content.split("\n");
  const wordBoundary = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
  const matchLine = lines.findIndex((l) => wordBoundary.test(l));
  if (matchLine === -1) return null;
  const start = Math.max(0, matchLine - TEST_SNIPPET_CONTEXT_LINES);
  const end = Math.min(lines.length, matchLine + TEST_SNIPPET_CONTEXT_LINES + 1);
  return lines.slice(start, end).join("\n");
}

/**
 * Retrieves, for one changed hunk, what a diff-only reviewer wouldn't
 * already see: (1) definitions of symbols the changed code calls, (2)
 * callers of the symbol being changed, (3) test files that reference it -
 * in that priority order, closest/most-direct relations first, until
 * `tokenBudget` runs out. Evaluated against `index` (built at the
 * introducing PR's BASE sha - see packages/indexer's README/plan): the diff
 * already shows the changed code itself, so retrieval's job is exactly the
 * pre-existing context the diff doesn't show.
 */
export function retrieveContext(index: RepoIndex, hunk: Hunk, tokenBudget: number): RetrievedContext {
  const changedSymbol = smallestOverlapping(index.symbols, hunk);
  const items: RetrievedItem[] = [];
  let usedTokens = 0;
  let truncated = false;

  function tryAdd(item: RetrievedItem): boolean {
    if (usedTokens + item.approxTokens > tokenBudget) {
      truncated = true;
      return false;
    }
    items.push(item);
    usedTokens += item.approxTokens;
    return true;
  }

  if (changedSymbol) {
    const calleeIds = new Set(index.calls.filter((c) => c.from === changedSymbol.id).map((c) => c.to));
    const callees = index.symbols.filter((s) => calleeIds.has(s.id));
    for (const callee of callees) {
      const added = tryAdd({
        kind: "callee-def",
        file: callee.file,
        name: callee.name,
        startLine: callee.startLine,
        endLine: callee.endLine,
        snippet: callee.text,
        approxTokens: approxTokens(callee.text),
      });
      if (!added) return { hunk, changedSymbol: { name: changedSymbol.name, kind: changedSymbol.kind }, items, truncated: true };
    }

    const callerIds = new Set(index.calls.filter((c) => c.to === changedSymbol.id).map((c) => c.from));
    const callers = index.symbols.filter((s) => callerIds.has(s.id));
    for (const caller of callers) {
      const added = tryAdd({
        kind: "caller",
        file: caller.file,
        name: caller.name,
        startLine: caller.startLine,
        endLine: caller.endLine,
        snippet: caller.text,
        approxTokens: approxTokens(caller.text),
      });
      if (!added) return { hunk, changedSymbol: { name: changedSymbol.name, kind: changedSymbol.kind }, items, truncated: true };
    }

    let testMatches = 0;
    for (const [file, content] of Object.entries(index.testFiles)) {
      if (testMatches >= MAX_TEST_FILE_MATCHES) break;
      const snippet = testSnippet(content, changedSymbol.name);
      if (!snippet) continue;
      testMatches++;
      const added = tryAdd({ kind: "test-reference", file, name: changedSymbol.name, snippet, approxTokens: approxTokens(snippet) });
      if (!added) break;
    }
  }

  return { hunk, changedSymbol: changedSymbol ? { name: changedSymbol.name, kind: changedSymbol.kind } : null, items, truncated };
}
