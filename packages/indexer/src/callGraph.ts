import type Parser from "tree-sitter";
import type { CallEdge, CodeSymbol } from "./types.js";
import type { Language } from "./parse.js";

function calleeName(fnNode: Parser.SyntaxNode): string | null {
  if (fnNode.type === "identifier") return fnNode.text;
  if (fnNode.type === "member_expression") return fnNode.childForFieldName("property")?.text ?? null; // a.b.c() -> "c"
  if (fnNode.type === "attribute") return fnNode.childForFieldName("attribute")?.text ?? null; // Python a.b.c() -> "c"
  return null;
}

/** The smallest symbol (in this file) whose line range contains `line` - i.e. the innermost enclosing function/method. */
function enclosingSymbol(fileSymbols: CodeSymbol[], line: number): CodeSymbol | null {
  let best: CodeSymbol | null = null;
  for (const s of fileSymbols) {
    if (line < s.startLine || line > s.endLine) continue;
    if (!best || s.endLine - s.startLine < best.endLine - best.startLine) best = s;
  }
  return best;
}

/**
 * Name-based call resolution only - no type information, so `a.b()` and
 * `c.b()` both resolve to every symbol named `b` anywhere in the repo. This
 * is the "symbol-based retrieval" CLAUDE.md scopes M3 to (no embeddings/
 * semantic resolution) - ambiguous edges are a known, accepted tradeoff.
 */
export function extractCallEdges(
  tree: Parser.Tree,
  fileSymbols: CodeSymbol[],
  allSymbolsByName: Map<string, CodeSymbol[]>,
  language: Language,
): CallEdge[] {
  const callNodeType = language === "python" ? "call" : "call_expression";
  const edges: CallEdge[] = [];

  for (const node of tree.rootNode.descendantsOfType(callNodeType)) {
    const fnNode = node.childForFieldName("function");
    if (!fnNode) continue;
    const name = calleeName(fnNode);
    if (!name) continue;

    const caller = enclosingSymbol(fileSymbols, node.startPosition.row + 1);
    if (!caller) continue;

    const callees = allSymbolsByName.get(name);
    if (!callees) continue;
    for (const callee of callees) {
      if (callee.id === caller.id) continue;
      edges.push({ from: caller.id, to: callee.id });
    }
  }

  return edges;
}
