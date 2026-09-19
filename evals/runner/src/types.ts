// Type-only re-export from evals/dataset - erased at compile time, so this
// carries no runtime coupling to that package's CLI entry point.
export type { MinedPair, GroundTruthRange, PairSummary, PairMethod, PairConfidence } from "../../dataset/src/types.js";

export type EvalMode = "diff-only" | "repo-aware";
export type SplitName = "dev" | "test";

export interface RunOptions {
  mode: EvalMode;
  split: SplitName;
  provider: "google" | "groq" | "anthropic";
  model?: string;
  limit?: number;
  rpm: number;
  contextTokens: number;
}
