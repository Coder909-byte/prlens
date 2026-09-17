import { describe, expect, it } from "vitest";
import { filterDiffFiles, type PrFile } from "../src/diffFilter.js";

describe("filterDiffFiles", () => {
  it("skips removed files, lockfiles, binaries and generated files", () => {
    const files: PrFile[] = [
      { filename: "src/a.ts", status: "modified", patch: "@@ -1 +1 @@\n-a\n+b" },
      { filename: "src/b.ts", status: "removed", patch: "@@ -1 +0,0 @@\n-b" },
      { filename: "pnpm-lock.yaml", status: "modified", patch: "@@ -1 +1 @@\n-x\n+y" },
      { filename: "logo.png", status: "modified" }, // no patch => binary
      { filename: "dist/bundle.min.js", status: "modified", patch: "@@ -1 +1 @@\n-x\n+y" },
    ];

    const { included, skipped } = filterDiffFiles(files, 1_000_000);

    expect(included.map((f) => f.filename)).toEqual(["src/a.ts"]);
    expect(skipped).toEqual([
      { filename: "src/b.ts", reason: "removed" },
      { filename: "pnpm-lock.yaml", reason: "lockfile" },
      { filename: "logo.png", reason: "binary" },
      { filename: "dist/bundle.min.js", reason: "generated" },
    ]);
  });

  it("caps total diff size and skips files beyond the cap", () => {
    const files: PrFile[] = [
      { filename: "a.ts", status: "modified", patch: "x".repeat(50) },
      { filename: "b.ts", status: "modified", patch: "y".repeat(50) },
      { filename: "c.ts", status: "modified", patch: "z".repeat(50) },
    ];

    const { included, skipped } = filterDiffFiles(files, 80);

    expect(included.map((f) => f.filename)).toEqual(["a.ts"]);
    expect(skipped).toEqual([
      { filename: "b.ts", reason: "diff size cap" },
      { filename: "c.ts", reason: "diff size cap" },
    ]);
  });
});
