import { APICallError, RetryError } from "ai";

/** True for AI SDK errors this module knows how to summarize tersely for logging. */
export function isProviderError(error: unknown): boolean {
  return RetryError.isInstance(error) || APICallError.isInstance(error);
}

/**
 * True when a provider call failed in a way that's worth trying the next
 * fallback provider for: the primary exhausted its own retries (RetryError -
 * generateObject's internal maxRetries already retried a 429/503/network
 * error and gave up), or a single retryable APICallError slipped through
 * un-retried, or a timeout/abort.
 */
export function isRetryableProviderError(error: unknown): boolean {
  if (RetryError.isInstance(error)) return true;
  if (APICallError.isInstance(error)) {
    if (error.isRetryable) return true;
    if (error.statusCode === 429 || error.statusCode === 503) return true;
  }
  if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) return true;
  return false;
}

export interface ProviderErrorSummary {
  errorType: string;
  statusCode?: number;
  attempts?: number;
  message: string;
}

/**
 * Terse, log-safe summary of an AI SDK error. A RetryError's `.errors` array
 * holds one full APICallError per attempt - each carrying the complete
 * request body (the whole diff) - so logging it directly repeats the diff
 * once per retry and floods the terminal. This keeps only what's needed to
 * diagnose an outage: the status code, how many attempts were made, and the
 * final message.
 */
export function summarizeProviderError(error: unknown): ProviderErrorSummary {
  if (RetryError.isInstance(error)) {
    const lastError = error.errors[error.errors.length - 1];
    return {
      errorType: "RetryError",
      statusCode: APICallError.isInstance(lastError) ? lastError.statusCode : undefined,
      attempts: error.errors.length,
      message: error.message,
    };
  }
  if (APICallError.isInstance(error)) {
    return { errorType: "APICallError", statusCode: error.statusCode, attempts: 1, message: error.message };
  }
  if (error instanceof Error) {
    return { errorType: error.name, message: error.message };
  }
  return { errorType: "unknown", message: String(error) };
}
