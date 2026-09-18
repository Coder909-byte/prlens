import { generateObject, NoObjectGeneratedError, type LanguageModel } from "ai";
import { config, logger, type LlmProvider } from "@prlens/shared";
import { resolveLanguageModel } from "./model.js";
import { FindingsSchema, type Finding } from "./schema.js";
import { loadPrompt } from "./prompt.js";
import { buildDiffText } from "./diffText.js";
import type { IncludedFile, SkippedFile } from "./diffFilter.js";
import { isRetryableProviderError, summarizeProviderError } from "./providerErrors.js";

export interface ReviewOutcome {
  findings: Finding[];
  usage: { inputTokens: number; outputTokens: number };
  /** The provider/model actually attempted first (LLM_PROVIDER/LLM_MODEL). */
  primaryProvider: string;
  primaryModel: string;
  /** The provider/model that actually produced this outcome - may differ from primary after a fallback. */
  provider: string;
  model: string;
  /** true if the LLM never returned a schema-valid findings object after retrying. */
  failed: boolean;
}

const VALIDATION_RETRY_NOTE =
  "\n\n## Note\nYour previous response did not match the required JSON schema. Return only a valid findings object this time.";

const MISSING_TEST_DISABLED_NOTE =
  "\n\n## Note\nDo not report missing_test findings in this review - that category is disabled.";

function filterFindings(findings: Finding[]): Finding[] {
  if (config.REPORT_MISSING_TESTS) return findings;
  return findings.filter((f) => f.category !== "missing_test");
}

type AttemptResult =
  | { status: "success"; findings: Finding[] }
  | { status: "validation-failed" }
  | { status: "retryable-error" }
  | { status: "timed-out" };

/**
 * Runs one provider/model against the diff. Rate limiting (HTTP 429) and
 * other retryable provider errors are retried with exponential backoff
 * inside generateObject itself (maxRetries) - a Vercel AI SDK built-in, not
 * something we re-implement here. LLM_MAX_RETRIES is kept small (default 1 -
 * two attempts) on purpose: a 503 (overloaded) or 429 (rate/quota exhausted)
 * won't resolve itself within one provider's backoff schedule, so failing
 * over to the next provider quickly beats waiting it out. If retries are
 * exhausted (or a retryable error otherwise slips through), that's reported
 * as "retryable-error" so the caller can fall back.
 *
 * Separately, a schema-invalid response (NoObjectGeneratedError) gets one
 * corrective re-prompt on the *same* provider - that's a model-quality
 * problem, not an availability one, so it doesn't trigger provider fallback.
 */
async function attemptProvider(
  model: LanguageModel,
  system: string,
  baseDiffText: string,
  usage: { inputTokens: number; outputTokens: number },
  provider: LlmProvider,
  modelId: string,
  abortSignal: AbortSignal,
): Promise<AttemptResult> {
  let promptText = baseDiffText;

  for (let attempt = 0; attempt <= 1; attempt++) {
    try {
      const result = await generateObject({
        model,
        system,
        schema: FindingsSchema,
        prompt: promptText,
        maxRetries: config.LLM_MAX_RETRIES,
        abortSignal,
      });
      usage.inputTokens += result.usage.inputTokens ?? 0;
      usage.outputTokens += result.usage.outputTokens ?? 0;
      return { status: "success", findings: result.object.findings };
    } catch (error) {
      // Check this first, regardless of how the SDK surfaces an aborted
      // call (AbortError, a wrapped RetryError, etc.) - once the overall
      // time budget is spent there's no point classifying the error further.
      if (abortSignal.aborted) {
        return { status: "timed-out" };
      }
      if (NoObjectGeneratedError.isInstance(error)) {
        usage.inputTokens += error.usage?.inputTokens ?? 0;
        usage.outputTokens += error.usage?.outputTokens ?? 0;
        promptText = baseDiffText + VALIDATION_RETRY_NOTE;
        continue;
      }
      if (isRetryableProviderError(error)) {
        logger.warn(
          { ...summarizeProviderError(error), provider, model: modelId },
          "provider call failed with a retryable error",
        );
        return { status: "retryable-error" };
      }
      // Not recoverable by re-prompting or by trying another provider (e.g.
      // auth failure, bad request) - propagate so pg-boss retries the job.
      throw error;
    }
  }

  return { status: "validation-failed" };
}

/**
 * Tries LLM_PROVIDER first, then each of LLM_FALLBACK_PROVIDERS in order,
 * moving to the next only when the current one fails with a retryable
 * (429/503/timeout) error after exhausting its own retries. Every provider
 * except the primary uses its own default model - LLM_MODEL only applies to
 * LLM_PROVIDER.
 *
 * The whole call - every attempt, every provider - is bounded by
 * LLM_REVIEW_TIMEOUT_SECONDS: once that's up, the in-flight request is
 * aborted and no further providers are tried, so one review job's worst-case
 * latency doesn't scale with how many fallback providers are configured.
 */
export async function runDiffOnlyReview(files: IncludedFile[], skipped: SkippedFile[]): Promise<ReviewOutcome> {
  const { provider: primaryProvider, modelId: primaryModelId } = resolveLanguageModel(
    config.LLM_PROVIDER,
    config.LLM_MODEL,
  );
  const providersToTry: LlmProvider[] = [
    config.LLM_PROVIDER,
    ...config.LLM_FALLBACK_PROVIDERS.filter((p) => p !== config.LLM_PROVIDER),
  ];

  const system = loadPrompt("diff-only.v2.md") + (config.REPORT_MISSING_TESTS ? "" : MISSING_TEST_DISABLED_NOTE);
  const baseDiffText = buildDiffText(files, skipped);
  const usage = { inputTokens: 0, outputTokens: 0 };

  const timeoutMs = config.LLM_REVIEW_TIMEOUT_SECONDS * 1000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    for (const provider of providersToTry) {
      if (controller.signal.aborted) break;

      const modelOverride = provider === config.LLM_PROVIDER ? config.LLM_MODEL : undefined;
      const { model, modelId } = resolveLanguageModel(provider, modelOverride);

      const result = await attemptProvider(model, system, baseDiffText, usage, provider, modelId, controller.signal);

      if (result.status === "success") {
        if (provider !== primaryProvider) {
          logger.info(
            { primaryProvider, primaryModel: primaryModelId, provider, model: modelId },
            "review served by fallback provider",
          );
        }
        const findings = filterFindings(result.findings);
        return { findings, usage, primaryProvider, primaryModel: primaryModelId, provider, model: modelId, failed: false };
      }
      if (result.status === "validation-failed") {
        return { findings: [], usage, primaryProvider, primaryModel: primaryModelId, provider, model: modelId, failed: true };
      }
      if (result.status === "timed-out") break;
      // retryable-error: fall through to the next provider in providersToTry.
    }
  } finally {
    clearTimeout(timer);
  }

  if (controller.signal.aborted) {
    throw new Error(`Review exceeded the ${config.LLM_REVIEW_TIMEOUT_SECONDS}s time budget (LLM_REVIEW_TIMEOUT_SECONDS)`);
  }
  throw new Error(`All LLM providers failed with a retryable error: ${providersToTry.join(", ")}`);
}
