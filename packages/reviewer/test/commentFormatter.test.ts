import { describe, expect, it } from "vitest";
import { formatReview } from "../src/commentFormatter.js";

describe("formatReview", () => {
  it("headers a diff-only review as diff-only", () => {
    const { body } = formatReview([], new Map(), [], false, "diff-only");
    expect(body).toContain("## PRLens diff-only review");
    expect(body).not.toContain("repo-aware");
  });

  it("headers a repo-aware review as repo-aware, not diff-only", () => {
    const { body } = formatReview([], new Map(), [], false, "repo-aware");
    expect(body).toContain("## PRLens repo-aware review");
    expect(body).not.toContain("diff-only");
  });
});
