import Parser from "tree-sitter";
import JavaScript from "tree-sitter-javascript";
import TypeScript from "tree-sitter-typescript";
import Python from "tree-sitter-python";

// The grammar packages' bundled .d.ts files predate tree-sitter core
// 0.22's stricter `Parser.Language` shape (their `.language` property types
// as `unknown`) - confirmed working at runtime against a real repo, this
// cast only papers over a type-declaration version skew, not a real
// incompatibility.
type GrammarLanguage = Parser.Language;
const JS_LANGUAGE = JavaScript as unknown as GrammarLanguage;
const TS_LANGUAGE = TypeScript.typescript as unknown as GrammarLanguage;
const TSX_LANGUAGE = TypeScript.tsx as unknown as GrammarLanguage;
const PY_LANGUAGE = Python as unknown as GrammarLanguage;

export type Language = "javascript" | "typescript" | "tsx" | "python";

const EXTENSION_LANGUAGE: Record<string, Language> = {
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".ts": "typescript",
  ".tsx": "tsx",
  ".py": "python",
};

export function languageForFile(filename: string): Language | null {
  const match = /\.[^./]+$/.exec(filename);
  if (!match) return null;
  return EXTENSION_LANGUAGE[match[0]] ?? null;
}

const parsers = new Map<Language, Parser>();

function parserFor(language: Language): Parser {
  const cached = parsers.get(language);
  if (cached) return cached;

  const parser = new Parser();
  switch (language) {
    case "javascript":
      parser.setLanguage(JS_LANGUAGE);
      break;
    case "typescript":
      parser.setLanguage(TS_LANGUAGE);
      break;
    case "tsx":
      parser.setLanguage(TSX_LANGUAGE);
      break;
    case "python":
      parser.setLanguage(PY_LANGUAGE);
      break;
  }
  parsers.set(language, parser);
  return parser;
}

export function parseSource(source: string, language: Language): Parser.Tree {
  return parserFor(language).parse(source);
}
