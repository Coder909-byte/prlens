import { describe, expect, it } from "vitest";
import "../src/bigint.js";

describe("BigInt.prototype.toJSON patch", () => {
  it("lets JSON.stringify handle a realistically large GitHub ID instead of throwing", () => {
    // Larger than Postgres INT4's max (2147483647) - the actual bug this
    // covers: GitHub review/installation IDs routinely exceed it.
    const githubReviewId = 5246495248n;

    expect(() => JSON.stringify({ githubReviewId })).not.toThrow();
    expect(JSON.stringify({ githubReviewId })).toBe('{"githubReviewId":"5246495248"}');
  });

  it("round-trips through JSON as a decimal string, not a lossy float", () => {
    // Beyond Number.MAX_SAFE_INTEGER (2^53 - 1) - real GitHub IDs aren't this
    // large yet, but the patch must not silently lose precision if they ever are.
    const huge = 9007199254740993n; // MAX_SAFE_INTEGER + 2
    const serialized = JSON.stringify({ id: huge });
    expect(serialized).toBe('{"id":"9007199254740993"}');
    expect(BigInt(JSON.parse(serialized).id)).toBe(huge);
  });
});
