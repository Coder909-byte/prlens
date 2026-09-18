import { describe, expect, it } from "vitest";
import { APICallError, RetryError } from "ai";
import { isRetryableProviderError, summarizeProviderError } from "../src/providerErrors.js";

function makeApiCallError(statusCode: number, isRetryable: boolean) {
  return new APICallError({
    message: `request failed with status ${statusCode}`,
    url: "https://example.test/v1/generate",
    requestBodyValues: { some: "very large diff payload".repeat(1000) },
    statusCode,
    isRetryable,
  });
}

function makeRetryError(attempts: number, statusCode: number) {
  const errors = Array.from({ length: attempts }, () => makeApiCallError(statusCode, true));
  return new RetryError({
    message: `Failed after ${attempts} attempts. Last error: request failed with status ${statusCode}`,
    reason: "maxRetriesExceeded",
    errors,
  });
}

describe("isRetryableProviderError", () => {
  it("treats a RetryError (retries already exhausted) as retryable", () => {
    expect(isRetryableProviderError(makeRetryError(6, 503))).toBe(true);
  });

  it("treats a 429 or 503 APICallError as retryable even if isRetryable wasn't set", () => {
    expect(isRetryableProviderError(makeApiCallError(429, false))).toBe(true);
    expect(isRetryableProviderError(makeApiCallError(503, false))).toBe(true);
  });

  it("does not treat a non-retryable 404 as retryable", () => {
    expect(isRetryableProviderError(makeApiCallError(404, false))).toBe(false);
  });

  it("does not treat a plain error as retryable", () => {
    expect(isRetryableProviderError(new Error("boom"))).toBe(false);
  });
});

describe("summarizeProviderError", () => {
  it("summarizes a RetryError without repeating the underlying request bodies", () => {
    const error = makeRetryError(6, 503);
    const summary = summarizeProviderError(error);

    expect(summary).toEqual({
      errorType: "RetryError",
      statusCode: 503,
      attempts: 6,
      message: error.message,
    });
    expect(JSON.stringify(summary)).not.toContain("very large diff payload");
  });

  it("summarizes a bare APICallError", () => {
    const error = makeApiCallError(404, false);
    expect(summarizeProviderError(error)).toEqual({
      errorType: "APICallError",
      statusCode: 404,
      attempts: 1,
      message: error.message,
    });
  });

  it("falls back to name/message for a plain Error", () => {
    const error = new TypeError("network down");
    expect(summarizeProviderError(error)).toEqual({ errorType: "TypeError", message: "network down" });
  });
});
