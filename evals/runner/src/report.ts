import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { PairScore } from "./scoring.js";
import { aggregate, aggregateByRepo, type AggregateStats } from "./scoring.js";

const here = dirname(fileURLToPath(import.meta.url));
export const REPORTS_DIR = join(here, "..", "..", "reports");

function fmtPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function fmtCost(n: number | null): string {
  return n === null ? "n/a (pricing unavailable)" : `$${n.toFixed(5)}`;
}

function statsRow(label: string, s: AggregateStats): string {
  return `| ${label} | ${s.pairCount} | ${fmtPct(s.recall)} | ${s.fpPerPr.toFixed(2)} | ${fmtCost(s.avgCostUsd)} | ${s.p50LatencyMs}ms | ${s.p95LatencyMs}ms | ${s.failedCount} |`;
}

export interface ReportMeta {
  mode: string;
  provider: string;
  model: string;
  promptVersion: string;
  splitNote: string;
  generatedAt: string;
}

export function buildReport(meta: ReportMeta, scores: PairScore[]): string {
  const overall = aggregate(scores);
  const byRepo = aggregateByRepo(scores);

  const lines: string[] = [];
  lines.push(`# Eval report — ${meta.mode}`);
  lines.push("");
  lines.push(`Generated: ${meta.generatedAt}`);
  lines.push(`Provider: ${meta.provider} · Prompt: ${meta.promptVersion}`);
  lines.push("");
  lines.push(`> **Note on dataset size**: ${meta.splitNote}`);
  lines.push("");
  lines.push("## Overall");
  lines.push("");
  lines.push("| Split | Pairs | Recall | FP/PR | Avg cost | p50 latency | p95 latency | Failed |");
  lines.push("|---|---|---|---|---|---|---|---|");
  lines.push(statsRow("all", overall));
  lines.push("");
  lines.push(`Total cost: ${fmtCost(overall.totalCostUsd)}`);
  lines.push("");
  lines.push("## Per-repo breakdown");
  lines.push("");
  lines.push("| Repo | Pairs | Recall | FP/PR | Avg cost | p50 latency | p95 latency | Failed |");
  lines.push("|---|---|---|---|---|---|---|---|");
  for (const [repo, stats] of [...byRepo.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    lines.push(statsRow(repo, stats));
  }
  lines.push("");
  lines.push("## Per-pair results");
  lines.push("");
  lines.push("| Pair | Caught | FPs | Cost | Latency |");
  lines.push("|---|---|---|---|---|");
  for (const s of [...scores].sort((a, b) => a.pairId.localeCompare(b.pairId))) {
    lines.push(`| ${s.pairId} | ${s.caught ? "✓" : "✗"} | ${s.falsePositives} | ${fmtCost(s.costUsd)} | ${s.latencyMs}ms |`);
  }
  lines.push("");

  return lines.join("\n");
}

export function writeReport(filename: string, content: string): string {
  mkdirSync(REPORTS_DIR, { recursive: true });
  const path = join(REPORTS_DIR, filename);
  writeFileSync(path, content);
  return path;
}
