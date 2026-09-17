import { describe, expect, it } from "vitest";
import { parseDiffHunks } from "../src/diffLines.js";

describe("parseDiffHunks", () => {
  it("returns an empty set for a missing/binary patch", () => {
    expect(parseDiffHunks(undefined)).toEqual(new Set());
    expect(parseDiffHunks(null)).toEqual(new Set());
    expect(parseDiffHunks("")).toEqual(new Set());
  });

  it("includes added and context lines, excludes deleted lines", () => {
    const patch = [
      "@@ -10,4 +10,5 @@ function foo() {",
      " context line 10",
      "-old line 11",
      "+new line 11",
      "+new line 12",
      " context line 13",
    ].join("\n");

    const valid = parseDiffHunks(patch);
    // new file line numbers, starting at 10:
    // 10: context -> valid
    // 11: added   -> valid
    // 12: added   -> valid
    // 13: context -> valid
    expect(valid).toEqual(new Set([10, 11, 12, 13]));
  });

  it("handles multiple hunks in one patch, each with its own start line", () => {
    const patch = [
      "@@ -1,2 +1,2 @@",
      " line 1",
      "-line 2 old",
      "+line 2 new",
      "@@ -50,2 +51,3 @@",
      " line 51",
      "+line 52",
      " line 53",
    ].join("\n");

    const valid = parseDiffHunks(patch);
    expect(valid).toEqual(new Set([1, 2, 51, 52, 53]));
  });

  it("ignores the 'no newline at end of file' marker line", () => {
    const patch = ["@@ -1,1 +1,1 @@", "-old", "+new", "\\ No newline at end of file"].join("\n");

    const valid = parseDiffHunks(patch);
    expect(valid).toEqual(new Set([1]));
  });
});
