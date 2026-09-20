export type SymbolKind = "function" | "method" | "class";

export interface CodeSymbol {
  /** `${file}:${name}:${startLine}` - unique enough without a real symbol table. */
  id: string;
  name: string;
  kind: SymbolKind;
  file: string;
  /** 1-indexed, inclusive. */
  startLine: number;
  endLine: number;
  text: string;
}

export interface CallEdge {
  /** Caller symbol id. */
  from: string;
  /** Callee symbol id - resolved by name only (no type info), so one call site can produce edges to several same-named symbols. */
  to: string;
}

export interface RepoIndex {
  repo: string;
  sha: string;
  symbols: CodeSymbol[];
  calls: CallEdge[];
  /**
   * Raw content of test/spec files, keyed by path - kept separately from
   * `symbols` because most JS/TS test files (Mocha/Jest-style
   * `it("...", function () {...})`) define no NAMED function a symbol
   * extractor would ever see, so a symbol-file-path lookup alone would miss
   * almost all of them. Retrieval falls back to a plain substring search
   * over this map instead.
   */
  testFiles: Record<string, string>;
}
