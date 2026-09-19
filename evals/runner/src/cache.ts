import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Finding } from "@prlens/reviewer";
import type { EvalMode } from "./types.js";

const here = dirname(fileURLToPath(import.meta.url));
export const CACHE_DIR = join(here, "..", ".cache");

export interface CacheEntry {
  pairId: string;
  mode: EvalMode;
  provider: string;
  model: string;
  promptVersion: string;
  findings: Finding[];
  inputTokens: number;
  outputTokens: number;
  costUsd: number | null;
  latencyMs: number;
  failed: boolean;
  /** Populated only for repo-aware mode - what was retrieved per changed hunk, so a finding (or its absence) can be explained. */
  retrievedContext?: unknown;
}

export function hashPromptText(promptText: string): string {
  return createHash("sha256").update(promptText).digest("hex").slice(0, 16);
}

/** `${owner}/${repo}#${prNumber}@${headSha}:${mode}:${provider}:${model}:${promptHash}` - a prompt edit invalidates the cache even under the same version filename. */
export function cacheKey(params: {
  repo: string;
  prNumber: number | null;
  headSha: string;
  mode: EvalMode;
  provider: string;
  model: string;
  promptHash: string;
}): string {
  const pr = params.prNumber ?? "none";
  return `${params.repo}#${pr}@${params.headSha}:${params.mode}:${params.provider}:${params.model}:${params.promptHash}`;
}

function cachePath(key: string): string {
  const safe = createHash("sha256").update(key).digest("hex");
  return join(CACHE_DIR, `${safe}.json`);
}

export function readCache(key: string): CacheEntry | null {
  const path = cachePath(key);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8")) as CacheEntry;
}

/** Atomic write (temp file + rename), same pattern used throughout evals/dataset. */
export function writeCache(key: string, entry: CacheEntry): void {
  mkdirSync(CACHE_DIR, { recursive: true });
  const path = cachePath(key);
  const tmpPath = `${path}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(entry, null, 2));
  renameSync(tmpPath, path);
}
