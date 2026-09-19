import { describe, expect, it } from "vitest";
import {
  CI_CONFIG_FILE,
  NON_CODE_FILE,
  PACKAGE_MANIFEST_FILE,
  TEST_FILE,
  isReviewableGroundTruthFile,
  looksLikeBugFixTitle,
  labelsContradictBugFix,
} from "../src/identify.js";

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

describe("CI_CONFIG_FILE", () => {
  it("excludes CI pipeline definitions", () => {
    for (const filename of [".github/workflows/ci.yml", ".travis.yml", "karma.conf.js", ".circleci/config.yml", "appveyor.yml"]) {
      expect(CI_CONFIG_FILE.test(filename)).toBe(true);
    }
  });

  it("does not exclude real source files", () => {
    expect(CI_CONFIG_FILE.test("lib/config.js")).toBe(false);
  });
});

describe("PACKAGE_MANIFEST_FILE", () => {
  it("excludes dependency manifests/lockfiles", () => {
    for (const filename of ["package.json", "package-lock.json", "yarn.lock", "pnpm-lock.yaml", "Pipfile.lock"]) {
      expect(PACKAGE_MANIFEST_FILE.test(filename)).toBe(true);
    }
  });
});

describe("TEST_FILE", () => {
  it("excludes test/spec files across conventions", () => {
    for (const filename of ["test/stream.js", "test/specs/requests.spec.js", "src/foo.test.ts", "requests/test_sessions.py", "__tests__/x.js"]) {
      expect(TEST_FILE.test(filename)).toBe(true);
    }
  });

  it("does not exclude real source files", () => {
    expect(TEST_FILE.test("lib/adapters/http.js")).toBe(false);
  });
});

describe("isReviewableGroundTruthFile", () => {
  it("rejects any non-reviewable category, accepts real source", () => {
    for (const filename of ["readme.md", ".github/workflows/ci.yml", "package.json", "test/stream.js"]) {
      expect(isReviewableGroundTruthFile(filename)).toBe(false);
    }
    expect(isReviewableGroundTruthFile("index.js")).toBe(true);
  });

  it("excludes root-level and language-specific test file names", () => {
    for (const filename of ["test.js", "tests.py", "conftest.py"]) {
      expect(isReviewableGroundTruthFile(filename)).toBe(false);
    }
  });
});

describe("looksLikeBugFixTitle", () => {
  it("accepts titles naming a real bug", () => {
    for (const title of ["Fix crash on empty body", "fixes incorrect redirect handling", "Bug: wrong status code"]) {
      expect(looksLikeBugFixTitle(title)).toBe(true);
    }
  });

  it("rejects feature-shaped titles even when they contain a fix keyword", () => {
    for (const title of ["Add support for fixed-size buffers", "Implement fix for missing feature", "Support regression testing"]) {
      expect(looksLikeBugFixTitle(title)).toBe(false);
    }
  });

  it("rejects titles with no bug signal at all", () => {
    expect(looksLikeBugFixTitle("Add retry option")).toBe(false);
  });
});

describe("labelsContradictBugFix", () => {
  it("passes through when no issue or no labels", () => {
    expect(labelsContradictBugFix(undefined)).toBe(false);
    expect(labelsContradictBugFix({ title: "x", labels: [] })).toBe(false);
  });

  it("passes when a bug label is present", () => {
    expect(labelsContradictBugFix({ title: "x", labels: ["bug", "P1"] })).toBe(false);
  });

  it("flags a non-bug label with no bug label present", () => {
    expect(labelsContradictBugFix({ title: "x", labels: ["enhancement"] })).toBe(true);
  });
});
