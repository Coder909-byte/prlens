import { createInterface } from "node:readline/promises";
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { loadPrompt, DIFF_ONLY_PROMPT_VERSION, REPO_AWARE_PROMPT_VERSION } from "@prlens/reviewer";
import { createEvalOctokit } from "./github.js";
import { loadPairsForSplit, getSplitNote } from "./splits.js";
import { runEval } from "./runEval.js";
import { buildReport, writeReport, REPORTS_DIR } from "./report.js";
import { hashPromptText } from "./cache.js";
import type { RunOptions, EvalMode, SplitName } from "./types.js";

function parseArgs(argv: string[]): RunOptions {
  let mode: EvalMode | undefined;
  let split: SplitName | undefined;
  let provider: RunOptions["provider"] | undefined;
  let model: string | undefined;
  let limit: number | undefined;
  let rpm = 10;
  let contextTokens = 2000;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--mode") mode = argv[++i] as EvalMode;
    else if (arg === "--split") split = argv[++i] as SplitName;
    else if (arg === "--provider") provider = argv[++i] as RunOptions["provider"];
    else if (arg === "--model") model = argv[++i];
    else if (arg === "--limit") limit = Number(argv[++i]);
    else if (arg === "--rpm") rpm = Number(argv[++i]);
    else if (arg === "--context-tokens") contextTokens = Number(argv[++i]);
  }

  if (mode !== "diff-only" && mode !== "repo-aware") {
    throw new Error('--mode is required and must be "diff-only" or "repo-aware"');
  }
  if (split !== "dev" && split !== "test") {
    throw new Error('--split is required and must be "dev" or "test" (no default, on purpose)');
  }
  if (provider !== "google" && provider !== "groq" && provider !== "anthropic") {
    throw new Error('--provider is required and must be "google", "groq", or "anthropic" (no default, on purpose)');
  }

  return { mode, split, provider, model, limit, rpm, contextTokens };
}

/** `--split test` gets friction before running, distinct from the audit log (which only catches a violation after the fact): typing "yes" is required, and every invocation is appended to evals/reports/test-runs.log regardless of whether it's confirmed. */
async function confirmTestSplit(options: RunOptions, promptHash: string): Promise<void> {
  mkdirSync(REPORTS_DIR, { recursive: true });
  const logLine = `${new Date().toISOString()}\tmode=${options.mode}\tprovider=${options.provider}\tmodel=${options.model ?? "default"}\tpromptHash=${promptHash}\n`;
  appendFileSync(join(REPORTS_DIR, "test-runs.log"), logLine);

  console.log("\n⚠️  You are about to run against the TEST split. This should only happen when you are done tuning.");
  console.log(`   mode=${options.mode} provider=${options.provider} model=${options.model ?? "default"} promptHash=${promptHash}`);
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question('   Type "yes" to proceed: ');
  rl.close();
  if (answer.trim().toLowerCase() !== "yes") {
    console.log("Aborted.");
    process.exit(1);
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const pairs = loadPairsForSplit(options.split);

  const promptVersion = options.mode === "repo-aware" ? REPO_AWARE_PROMPT_VERSION : DIFF_ONLY_PROMPT_VERSION;

  if (options.split === "test") {
    const promptHash = hashPromptText(loadPrompt(promptVersion));
    await confirmTestSplit(options, promptHash);
  }

  if (options.limit !== undefined) pairs.splice(options.limit);

  if (pairs.length === 0) {
    console.log(`[eval] no pairs in split "${options.split}" - nothing to run.`);
    return;
  }

  const octokit = createEvalOctokit();
  const { scores, cacheHits, cacheMisses } = await runEval(pairs, octokit, options);

  console.log(`\n[eval] done: ${cacheHits} cache hits, ${cacheMisses} fresh LLM calls`);

  const report = buildReport(
    {
      mode: options.mode,
      provider: options.provider,
      model: options.model ?? "default",
      promptVersion,
      splitNote: getSplitNote(),
      generatedAt: new Date().toISOString(),
    },
    scores,
  );

  const date = new Date().toISOString().slice(0, 10);
  const filename = `${date}-${options.mode}-${options.provider}-${options.model ?? "default"}-${promptVersion.replace(/\.md$/, "")}-${options.split}.md`;
  const path = writeReport(filename, report);
  console.log(`[eval] report written to ${path}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
