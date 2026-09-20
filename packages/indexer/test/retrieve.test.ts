import { describe, expect, it } from "vitest";
import { retrieveContext } from "../src/retrieve.js";
import type { RepoIndex } from "../src/types.js";

function makeIndex(): RepoIndex {
  return {
    repo: "test/repo",
    sha: "abc",
    symbols: [
      { id: "a.js:changed:1", name: "changed", kind: "function", file: "a.js", startLine: 1, endLine: 5, text: "function changed() { helper(); }" },
      { id: "a.js:helper:10", name: "helper", kind: "function", file: "a.js", startLine: 10, endLine: 12, text: "function helper() { return 1; }" },
      { id: "b.js:caller:1", name: "caller", kind: "function", file: "b.js", startLine: 1, endLine: 3, text: "function caller() { changed(); }" },
    ],
    calls: [
      { from: "a.js:changed:1", to: "a.js:helper:10" },
      { from: "b.js:caller:1", to: "a.js:changed:1" },
    ],
    testFiles: {
      "test/a.test.js": "it('works', () => {\n  expect(changed()).toBe(1);\n});\n",
    },
  };
}

describe("retrieveContext", () => {
  it("finds the symbol overlapping the hunk", () => {
    const result = retrieveContext(makeIndex(), { file: "a.js", startLine: 2, endLine: 2 }, 10_000);
    expect(result.changedSymbol?.name).toBe("changed");
  });

  it("retrieves the changed symbol's callee, its caller, and a referencing test", () => {
    const result = retrieveContext(makeIndex(), { file: "a.js", startLine: 2, endLine: 2 }, 10_000);
    const kinds = result.items.map((i) => i.kind);
    expect(kinds).toContain("callee-def");
    expect(kinds).toContain("caller");
    expect(kinds).toContain("test-reference");
    expect(result.truncated).toBe(false);
  });

  it("truncates once the token budget is hit and reports it", () => {
    const result = retrieveContext(makeIndex(), { file: "a.js", startLine: 2, endLine: 2 }, 1);
    expect(result.truncated).toBe(true);
    expect(result.items.length).toBe(0);
  });

  it("returns no changed symbol and no items for a hunk outside every known symbol", () => {
    const result = retrieveContext(makeIndex(), { file: "a.js", startLine: 100, endLine: 100 }, 10_000);
    expect(result.changedSymbol).toBeNull();
    expect(result.items).toEqual([]);
  });
});
