import { describe, expect, it } from "vitest";
import { cacheKey, hashPromptText } from "../src/cache.js";

describe("cacheKey", () => {
  it("includes mode so diff-only and repo-aware never collide", () => {
    const base = { repo: "a/b", prNumber: 1, headSha: "sha1", provider: "groq", model: "m", promptHash: "hash1" };
    const diffOnly = cacheKey({ ...base, mode: "diff-only" });
    const repoAware = cacheKey({ ...base, mode: "repo-aware" });
    expect(diffOnly).not.toBe(repoAware);
  });

  it("changes when the prompt hash changes, even under the same version label", () => {
    const base = { repo: "a/b", prNumber: 1, headSha: "sha1", mode: "diff-only" as const, provider: "groq", model: "m" };
    const key1 = cacheKey({ ...base, promptHash: "hash1" });
    const key2 = cacheKey({ ...base, promptHash: "hash2" });
    expect(key1).not.toBe(key2);
  });

  it("handles a null PR number (direct-push pair)", () => {
    const key = cacheKey({ repo: "a/b", prNumber: null, headSha: "sha1", mode: "diff-only", provider: "groq", model: "m", promptHash: "hash1" });
    expect(key).toContain("#none@sha1");
  });
});

describe("hashPromptText", () => {
  it("is deterministic and sensitive to content changes", () => {
    expect(hashPromptText("hello")).toBe(hashPromptText("hello"));
    expect(hashPromptText("hello")).not.toBe(hashPromptText("hello!"));
  });
});
