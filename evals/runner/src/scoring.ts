import type { Finding } from "@prlens/reviewer";
import type { MinedPair } from "./types.js";

export interface PairScore {
  pairId: string;
  repo: string;
  caught: boolean;
  falsePositives: number;
  latencyMs: number;
  costUsd: number | null;
  inputTokens: number;
  outputTokens: number;
  failed: boolean;
}

/**
 * A finding "catches" the bug if it names the same file and lands within
 * ±5 lines of ANY ground-truth range for the pair (a bug can have ground
 * truth spanning several hunks/files - catching one is catching the bug,
 * not requiring every location to be flagged). Every other finding on that
 * pair is a false positive.
 */
export function scoreFindings(pair: MinedPair, findings: Finding[]): { caught: boolean; falsePositives: number } {
  let matchedCount = 0;
  for (const finding of findings) {
    const matches = pair.groundTruth.some((gt) => gt.file === finding.file && finding.line >= gt.startLine - 5 && finding.line <= gt.endLine + 5);
    if (matches) matchedCount++;
  }
  return { caught: matchedCount > 0, falsePositives: findings.length - matchedCount };
}

export interface AggregateStats {
  pairCount: number;
  recall: number;
  fpPerPr: number;
  avgCostUsd: number | null;
  totalCostUsd: number | null;
  p50LatencyMs: number;
  p95LatencyMs: number;
  failedCount: number;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)]!;
}

export function aggregate(scores: PairScore[]): AggregateStats {
  const pairCount = scores.length;
  const caughtCount = scores.filter((s) => s.caught).length;
  const totalFp = scores.reduce((sum, s) => sum + s.falsePositives, 0);
  const latencies = scores.map((s) => s.latencyMs).sort((a, b) => a - b);
  const costs = scores.map((s) => s.costUsd).filter((c): c is number => c !== null);

  return {
    pairCount,
    recall: pairCount === 0 ? 0 : caughtCount / pairCount,
    fpPerPr: pairCount === 0 ? 0 : totalFp / pairCount,
    avgCostUsd: costs.length === 0 ? null : costs.reduce((a, b) => a + b, 0) / costs.length,
    totalCostUsd: costs.length === 0 ? null : costs.reduce((a, b) => a + b, 0),
    p50LatencyMs: percentile(latencies, 50),
    p95LatencyMs: percentile(latencies, 95),
    failedCount: scores.filter((s) => s.failed).length,
  };
}

export function aggregateByRepo(scores: PairScore[]): Map<string, AggregateStats> {
  const byRepo = new Map<string, PairScore[]>();
  for (const s of scores) {
    const list = byRepo.get(s.repo) ?? [];
    list.push(s);
    byRepo.set(s.repo, list);
  }
  const result = new Map<string, AggregateStats>();
  for (const [repo, list] of byRepo) result.set(repo, aggregate(list));
  return result;
}
