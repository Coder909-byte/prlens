import type Parser from "tree-sitter";
import type { CodeSymbol, SymbolKind } from "./types.js";
import type { Language } from "./parse.js";

interface DeclSpec {
  type: string;
  kind: SymbolKind;
}

const DECL_TYPES: Record<Language, DeclSpec[]> = {
  javascript: [
    { type: "function_declaration", kind: "function" },
    { type: "method_definition", kind: "method" },
    { type: "class_declaration", kind: "class" },
  ],
  typescript: [
    { type: "function_declaration", kind: "function" },
    { type: "method_definition", kind: "method" },
    { type: "class_declaration", kind: "class" },
  ],
  tsx: [
    { type: "function_declaration", kind: "function" },
    { type: "method_definition", kind: "method" },
    { type: "class_declaration", kind: "class" },
  ],
  python: [
    { type: "function_definition", kind: "function" },
    { type: "class_definition", kind: "class" },
  ],
};

function isInsidePythonClass(node: Parser.SyntaxNode): boolean {
  let p = node.parent;
  while (p) {
    if (p.type === "class_definition") return true;
    if (p.type === "function_definition") return false;
    p = p.parent;
  }
  return false;
}

/**
 * Best-effort chunk extraction - function/method/class declarations plus
 * the common JS/TS "assigned function" patterns (`const foo = () => {}`,
 * `exports.foo = function () {}`, `Foo.prototype.bar = function () {}`),
 * since a large fraction of real code (including several of this project's
 * own mined repos, e.g. got/axios) defines functions this way rather than
 * with `function foo() {}`. Python doesn't need this - `def` is the only form.
 */
export function extractSymbols(tree: Parser.Tree, file: string, language: Language, sourceLines: string[]): CodeSymbol[] {
  const symbols: CodeSymbol[] = [];
  const declTypes = DECL_TYPES[language];

  function textOf(node: Parser.SyntaxNode): string {
    return sourceLines.slice(node.startPosition.row, node.endPosition.row + 1).join("\n");
  }

  function push(node: Parser.SyntaxNode, name: string, kind: SymbolKind): void {
    const startLine = node.startPosition.row + 1;
    const endLine = node.endPosition.row + 1;
    symbols.push({ id: `${file}:${name}:${startLine}`, name, kind, file, startLine, endLine, text: textOf(node) });
  }

  function calleeNameFromAssignmentTarget(node: Parser.SyntaxNode): string | null {
    if (node.type === "identifier") return node.text;
    if (node.type === "member_expression") return node.childForFieldName("property")?.text ?? null;
    return null;
  }

  function walk(node: Parser.SyntaxNode): void {
    const decl = declTypes.find((d) => d.type === node.type);
    if (decl) {
      const nameNode = node.childForFieldName("name");
      if (nameNode) {
        const kind = language === "python" && node.type === "function_definition" && isInsidePythonClass(node) ? "method" : decl.kind;
        push(node, nameNode.text, kind);
      }
    } else if (language !== "python" && node.type === "variable_declarator") {
      const nameNode = node.childForFieldName("name");
      const valueNode = node.childForFieldName("value");
      if (nameNode?.type === "identifier" && valueNode && (valueNode.type === "arrow_function" || valueNode.type === "function_expression")) {
        push(node, nameNode.text, "function");
      }
    } else if (language !== "python" && node.type === "assignment_expression") {
      const leftNode = node.childForFieldName("left");
      const rightNode = node.childForFieldName("right");
      if (leftNode && rightNode && (rightNode.type === "arrow_function" || rightNode.type === "function_expression")) {
        const name = calleeNameFromAssignmentTarget(leftNode);
        if (name) push(node, name, "function");
      }
    }
    for (const child of node.namedChildren) walk(child);
  }

  walk(tree.rootNode);
  return symbols;
}
