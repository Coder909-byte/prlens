import { describe, expect, it } from "vitest";
import { addedRange, findUniqueLineByText, parseHunkLines, parseHunks } from "../src/diffText.js";

describe("parseHunkLines", () => {
  it("extracts added and context lines with their post-image line numbers", () => {
    const patch = [
      "@@ -10,3 +10,4 @@ function foo() {",
      " context line 10",
      "-old line 11",
      "+new line 11",
      "+new line 12",
      " context line 13",
    ].join("\n");

    expect(parseHunkLines(patch)).toEqual([
      { line: 10, text: "context line 10", kind: "context" },
      { line: 11, text: "new line 11", kind: "added" },
      { line: 12, text: "new line 12", kind: "added" },
      { line: 13, text: "context line 13", kind: "context" },
    ]);
  });

  it("skips file header lines that appear before the first hunk", () => {
    const patch = ["--- a/src/foo.js", "+++ b/src/foo.js", "@@ -1,1 +1,1 @@", "-old", "+new"].join("\n");
    expect(parseHunkLines(patch)).toEqual([{ line: 1, text: "new", kind: "added" }]);
  });

  it("returns an empty array for an empty or missing patch", () => {
    expect(parseHunkLines("")).toEqual([]);
  });
});

describe("parseHunks", () => {
  it("keeps separate hunks in the same file as separate arrays, not merged into one span", () => {
    // Mirrors the real got#10 case that motivated this: two small,
    // unrelated hunks in test.js must not collapse into one 28-90 range.
    const patch = [
      "@@ -28,9 +28,9 @@ it('should do HTTPS request', function (done) {",
      " context a",
      "-it('should should return status code as error when not 200'",
      "+it('should should return status code as error code when not 200'",
      " context b",
      "@@ -84,7 +84,7 @@ it('should proxy errors to the stream', function (done) {",
      " context c",
      "-\t\tassert.strictEqual(error, 404);",
      "+\t\tassert.strictEqual(error.code, 404);",
      " context d",
    ].join("\n");

    const hunks = parseHunks(patch);
    expect(hunks).toHaveLength(2);
    expect(addedRange(hunks[0]!)).toEqual({ startLine: 29, endLine: 29 });
    expect(addedRange(hunks[1]!)).toEqual({ startLine: 85, endLine: 85 });
  });
});

describe("addedRange", () => {
  it("only counts added lines, not surrounding context", () => {
    const patch = ["@@ -1,5 +1,5 @@", " context 1", " context 2", "-old", "+added", " context 3"].join("\n");
    const [hunk] = parseHunks(patch);
    expect(addedRange(hunk!)).toEqual({ startLine: 3, endLine: 3 });
  });

  it("returns null for a hunk with no added lines (pure deletion)", () => {
    const patch = ["@@ -1,3 +1,2 @@", " context 1", "-removed", " context 2"].join("\n");
    const [hunk] = parseHunks(patch);
    expect(addedRange(hunk!)).toBeNull();
  });
});

describe("findUniqueLineByText", () => {
  const lines = [
    { line: 5, text: "return x + 1;", kind: "added" as const },
    { line: 12, text: "return x + 1;", kind: "added" as const },
    { line: 20, text: "const y = 2;", kind: "context" as const },
  ];

  it("returns the line number when the text appears exactly once", () => {
    expect(findUniqueLineByText(lines, "const y = 2;")).toBe(20);
  });

  it("returns null when the text appears more than once (ambiguous)", () => {
    expect(findUniqueLineByText(lines, "return x + 1;")).toBeNull();
  });

  it("returns null when the text doesn't appear at all", () => {
    expect(findUniqueLineByText(lines, "nope")).toBeNull();
  });
});
