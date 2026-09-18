import { describe, expect, it } from "vitest";
import { parseLineHistoryOutput } from "../src/clone.js";

const SAMPLE_OUTPUT = [
  "commit aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "Author: Dev One <dev1@example.com>",
  "Date:   Mon Jan 1 00:00:00 2024 +0000",
  "",
  "    Fix off-by-one in foo()",
  "",
  "diff --git a/src/foo.js b/src/foo.js",
  "--- a/src/foo.js",
  "+++ b/src/foo.js",
  "@@ -10,3 +10,4 @@ function foo() {",
  " context line 10",
  "-old line 11",
  "+new line 11",
  "+new line 12",
  " context line 13",
  "",
  "commit bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  "Author: Dev Two <dev2@example.com>",
  "Date:   Sun Dec 31 00:00:00 2023 +0000",
  "",
  "    Rename utils to foo",
  "",
  "diff --git a/src/utils.js b/src/foo.js",
  "similarity index 95%",
  "rename from src/utils.js",
  "rename to src/foo.js",
  "--- a/src/utils.js",
  "+++ b/src/foo.js",
  "@@ -10,2 +10,3 @@",
  " context line 10",
  "+old line 11",
  " context line 13",
  "",
].join("\n");

describe("parseLineHistoryOutput", () => {
  it("splits multi-commit `git log -L` output into one entry per commit, newest first", () => {
    const entries = parseLineHistoryOutput(SAMPLE_OUTPUT);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toEqual({ sha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", looksLikeRename: false });
    expect(entries[1]).toEqual({ sha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", looksLikeRename: true });
  });

  it("returns an empty array for empty output", () => {
    expect(parseLineHistoryOutput("")).toEqual([]);
  });

  it("returns an empty array when the output has no commit headers", () => {
    expect(parseLineHistoryOutput("fatal: no such path in the working tree")).toEqual([]);
  });
});
