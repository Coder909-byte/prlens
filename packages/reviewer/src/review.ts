import { generateObject, NoObjectGeneratedError } from "ai";
import { config } from "@prlens/shared";
import { resolveLanguageModel } from "./model.js";
import { FindingsSchema, type Finding } from "./schema.js";
import { loadPrompt } from "./prompt.js";
import { buildDiffText } from "./diffText.js";
import type { IncludedFile, SkippedFile } from "./diffFilter.js";

export interface ReviewOutcome {
  findings: Finding[];
  usage: { inputTokens: number; outputTokens: number };
  provider: string;
  model: string;
  /** true if the LLM never returned a schema-valid findings object after retrying. */
  failed: boolean;
}

const VALIDATION_RETRY_NOTE =
  "\n\n## Note\nYour previous response did not match the required JSON schema. Return only a valid findings object this time.";

/**
 * Runs the diff-only review call. Rate limiting (HTTP 429) and other
 * retryable provider errors are retried with exponential backoff inside
 * generateObject itself (maxRetries, below) - that's a Vercel AI SDK
 * built-in, not something we re-implement here. What we retry ourselves is
 * the one case the SDK can't: the model responding with text that doesn't
 * validate against FindingsSchema. We give it one corrective retry, then
 * give up and let the caller post a short failure note instead of crashing
 * the job.
 */
export async function runDiffOnlyReview(files: IncludedFile[], skipped: SkippedFile[]): Promise<ReviewOutcome> {
  const { model, provider, modelId } = resolveLanguageModel(config.LLM_PROVIDER, config.LLM_MODEL);
  const system = loadPrompt("diff-only.v1.md");
  const baseDiffText = buildDiffText(files, skipped);

  const usage = { inputTokens: 0, outputTokens: 0 };
  let promptText = baseDiffText;

  for (let attempt = 0; attempt <= 1; attempt++) {
    try {
      const result = await generateObject({
        model,
        system,
        schema: FindingsSchema,
        prompt: promptText,
        maxRetries: config.LLM_MAX_RETRIES,
      });
      usage.inputTokens += result.usage.inputTokens ?? 0;
      usage.outputTokens += result.usage.outputTokens ?? 0;
      return { findings: result.object.findings, usage, provider, model: modelId, failed: false };
    } catch (error) {
      if (NoObjectGeneratedError.isInstance(error)) {
        usage.inputTokens += error.usage?.inputTokens ?? 0;
        usage.outputTokens += error.usage?.outputTokens ?? 0;
        promptText = baseDiffText + VALIDATION_RETRY_NOTE;
        continue;
      }
      // Rate-limit exhaustion, auth failure, network error, etc: not
      // recoverable by re-prompting - propagate so pg-boss retries the job.
      throw error;
    }
  }

  return { findings: [], usage, provider, model: modelId, failed: true };
}
