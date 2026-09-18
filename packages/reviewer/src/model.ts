import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import { createAnthropic } from "@ai-sdk/anthropic";
import type { LanguageModel } from "ai";
import type { LlmProvider } from "@prlens/shared";

/**
 * Per-provider default model, used when LLM_MODEL is unset.
 *
 * - google: "gemini-flash-latest" is Google's alias for whichever Flash
 *   model is current.
 * - groq: "openai/gpt-oss-120b" - verified live against GET
 *   /openai/v1/models on 2026-09-18. Groq retires models with little notice
 *   (llama-3.3-70b-versatile, this project's original default, now 404s) -
 *   gpt-oss-120b is Groq's largest model that lists "structured_outputs" in
 *   its supported_features. Re-check that endpoint if this starts 404ing too.
 */
const DEFAULT_MODEL_ID: Record<LlmProvider, string> = {
  google: "gemini-flash-latest",
  groq: "openai/gpt-oss-120b",
  anthropic: "claude-opus-5",
};

export interface ResolvedModel {
  model: LanguageModel;
  provider: LlmProvider;
  modelId: string;
}

/**
 * Resolves the configured LLM_PROVIDER/LLM_MODEL into a Vercel AI SDK
 * LanguageModel. Each provider factory reads its API key from the standard
 * env var (GOOGLE_GENERATIVE_AI_API_KEY / GROQ_API_KEY / ANTHROPIC_API_KEY)
 * on its own - config.ts only checks upfront that the right one is set.
 */
export function resolveLanguageModel(provider: LlmProvider, modelOverride: string | undefined): ResolvedModel {
  const modelId = modelOverride ?? DEFAULT_MODEL_ID[provider];

  switch (provider) {
    case "google":
      return { model: createGoogleGenerativeAI().languageModel(modelId), provider, modelId };
    case "groq":
      return { model: createGroq().languageModel(modelId), provider, modelId };
    case "anthropic":
      return { model: createAnthropic().languageModel(modelId), provider, modelId };
  }
}
