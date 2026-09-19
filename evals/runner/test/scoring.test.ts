import { describe, expect, it } from "vitest";
import { scoreFindings, aggregate } from "../src/scoring.js";
import type { MinedPair } from "../src/types.js";

function pair(groundTruth: MinedPair["groundTruth"]): MinedPair {
  return {
    id: "test/repo#1:file.js",
    repo: "test/repo",
    buggyPr: { number: 1, baseSha: "a", headSha: "b" },
    fixPr: { number: 2 },
    groundTruth,
    method: "revert",
    confidence: "high",
  };
}

describe("scoreFindings", () => {
  it("catches a finding within ±5 lines of the ground truth range", () => {
    const p = pair([{ file: "a.js", startLine: 10, endLine: 10 }]);
    const result = scoreFindings(p, [{ file: "a.js", line: 14, severity: "high", category: "bug", explanation: "x", suggested_fix: "", confidence: 0.9 }]);
    expect(result.caught).toBe(true);
    expect(result.falsePositives).toBe(0);
  });

  it("does not catch a finding more than 5 lines away", () => {
    const p = pair([{ file: "a.js", startLine: 10, endLine: 10 }]);
    const result = scoreFindings(p, [{ file: "a.js", line: 20, severity: "high", category: "bug", explanation: "x", suggested_fix: "", confidence: 0.9 }]);
    expect(result.caught).toBe(false);
    expect(result.falsePositives).toBe(1);
  });

  it("does not catch a finding in a different file", () => {
    const p = pair([{ file: "a.js", startLine: 10, endLine: 10 }]);
    const result = scoreFindings(p, [{ file: "b.js", line: 10, severity: "high", category: "bug", explanation: "x", suggested_fix: "", confidence: 0.9 }]);
    expect(result.caught).toBe(false);
    expect(result.falsePositives).toBe(1);
  });

  it("counts non-matching findings as false positives alongside a caught match", () => {
    const p = pair([{ file: "a.js", startLine: 10, endLine: 10 }]);
    const result = scoreFindings(p, [
      { file: "a.js", line: 10, severity: "high", category: "bug", explanation: "x", suggested_fix: "", confidence: 0.9 },
      { file: "a.js", line: 500, severity: "low", category: "style", explanation: "y", suggested_fix: "", confidence: 0.5 },
    ]);
    expect(result.caught).toBe(true);
    expect(result.falsePositives).toBe(1);
  });

  it("a wide ground-truth range extends the ±5 window from each end", () => {
    const p = pair([{ file: "a.js", startLine: 10, endLine: 20 }]);
    const result = scoreFindings(p, [{ file: "a.js", line: 24, severity: "high", category: "bug", explanation: "x", suggested_fix: "", confidence: 0.9 }]);
    expect(result.caught).toBe(true);
  });
});

describe("aggregate", () => {
  it("computes recall and FP/PR across pairs", () => {
    const scores = [
      { pairId: "1", repo: "r", caught: true, falsePositives: 1, latencyMs: 100, costUsd: 0.01, inputTokens: 10, outputTokens: 5, failed: false },
      { pairId: "2", repo: "r", caught: false, falsePositives: 2, latencyMs: 200, costUsd: 0.02, inputTokens: 10, outputTokens: 5, failed: false },
    ];
    const stats = aggregate(scores);
    expect(stats.recall).toBe(0.5);
    expect(stats.fpPerPr).toBe(1.5);
    expect(stats.pairCount).toBe(2);
  });

  it("handles an empty score list without dividing by zero", () => {
    const stats = aggregate([]);
    expect(stats.recall).toBe(0);
    expect(stats.fpPerPr).toBe(0);
    expect(stats.pairCount).toBe(0);
  });
});
