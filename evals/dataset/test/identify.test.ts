import { describe, expect, it } from "vitest";
import { NON_CODE_FILE } from "../src/identify.js";

describe("NON_CODE_FILE", () => {
  it("excludes prose/doc files a diff-only reviewer would never meaningfully flag a bug in", () => {
    for (const filename of ["readme.md", "README.md", "docs/CHANGELOG.md", "LICENSE", "CONTRIBUTING.rst", "notes.txt"]) {
      expect(NON_CODE_FILE.test(filename)).toBe(true);
    }
  });

  it("does not exclude real source/test files", () => {
    for (const filename of ["index.js", "src/foo.py", "test/stream.js", "lib/readme-parser.js"]) {
      expect(NON_CODE_FILE.test(filename)).toBe(false);
    }
  });
});
