interface ModelPrice {
  inputPerMTok: number;
  outputPerMTok: number;
}

/**
 * Best-effort $/1M-token rates for cost estimation, keyed by the literal
 * model id a provider call resolves to. Verified against each provider's
 * pricing page as of 2026-09. Update as pricing changes; an unlisted model
 * (including "latest"/alias ids we can't resolve to a concrete version)
 * intentionally returns a null cost rather than a guessed number.
 */
const PRICING_TABLE: Record<string, ModelPrice> = {
  // Google Gemini
  "gemini-2.5-flash": { inputPerMTok: 0.3, outputPerMTok: 2.5 },
  "gemini-3.5-flash": { inputPerMTok: 1.5, outputPerMTok: 9.0 },
  "gemini-3.6-flash": { inputPerMTok: 0.75, outputPerMTok: 3.75 },
  "gemini-3.7-flash": { inputPerMTok: 0.75, outputPerMTok: 3.75 },
  "gemini-3.8-flash": { inputPerMTok: 0.75, outputPerMTok: 3.75 },

  // Anthropic Claude
  "claude-opus-5": { inputPerMTok: 5.0, outputPerMTok: 25.0 },
  "claude-sonnet-5": { inputPerMTok: 2.0, outputPerMTok: 10.0 },
  "claude-haiku-4-5": { inputPerMTok: 1.0, outputPerMTok: 5.0 },
  "claude-opus-4-8": { inputPerMTok: 5.0, outputPerMTok: 25.0 },
};

export function computeCostUsd(
  _provider: string,
  modelId: string,
  inputTokens: number,
  outputTokens: number,
): number | null {
  const price = PRICING_TABLE[modelId];
  if (!price) return null;
  return (inputTokens / 1_000_000) * price.inputPerMTok + (outputTokens / 1_000_000) * price.outputPerMTok;
}
