import { describe, expect, it, vi, beforeEach } from "vitest";

// GitHub's numeric IDs are 64-bit and routinely exceed Postgres INT4's max
// (2147483647) - this is the exact value that broke `githubReviewId` when it
// was still an Int column.
const REALISTIC_LARGE_ID = 5246495248;

interface CapturedUpsertArgs {
  create: { installationId: bigint; githubReviewId: bigint | null; [key: string]: unknown };
  update: { githubReviewId: bigint | null; [key: string]: unknown };
}

let capturedArgs: CapturedUpsertArgs | undefined;
const upsertMock = vi.fn((args: CapturedUpsertArgs) => {
  capturedArgs = args;
  return Promise.resolve(undefined);
});

vi.mock("@prlens/db", async () => {
  const actual = await vi.importActual<typeof import("@prlens/db")>("@prlens/db");
  return {
    ...actual,
    prisma: { review: { upsert: upsertMock } },
  };
});

const { recordReview } = await import("../src/db.js");
const { ReviewStatus } = await import("@prlens/db");

describe("recordReview", () => {
  beforeEach(() => {
    upsertMock.mockClear();
    capturedArgs = undefined;
  });

  it("converts realistically large GitHub IDs to BigInt for Prisma, in both create and update", async () => {
    await recordReview({
      job: {
        installationId: REALISTIC_LARGE_ID,
        owner: "acme",
        repo: "widgets",
        pullNumber: 3,
        headSha: "abc123",
        baseSha: "def456",
      },
      status: ReviewStatus.SUCCEEDED,
      primaryProvider: "groq",
      primaryModel: "openai/gpt-oss-120b",
      provider: "groq",
      model: "openai/gpt-oss-120b",
      inputTokens: 100,
      outputTokens: 20,
      costUsd: null,
      latencyMs: 500,
      skipped: [],
      findings: [],
      inlineComments: [],
      githubReviewId: REALISTIC_LARGE_ID,
    });

    expect(upsertMock).toHaveBeenCalledTimes(1);
    expect(capturedArgs).toBeDefined();

    const { create, update } = capturedArgs!;
    expect(create.installationId).toBe(BigInt(REALISTIC_LARGE_ID));
    expect(typeof create.installationId).toBe("bigint");
    expect(create.githubReviewId).toBe(BigInt(REALISTIC_LARGE_ID));
    expect(typeof create.githubReviewId).toBe("bigint");
    expect(update.githubReviewId).toBe(BigInt(REALISTIC_LARGE_ID));
  });

  it("stores a null githubReviewId as null, not BigInt(null)", async () => {
    await recordReview({
      job: { installationId: 123, owner: "acme", repo: "widgets", pullNumber: 1, headSha: "x", baseSha: "y" },
      status: ReviewStatus.FAILED,
      primaryProvider: "groq",
      primaryModel: "m",
      provider: "groq",
      model: "m",
      inputTokens: 0,
      outputTokens: 0,
      costUsd: null,
      latencyMs: 10,
      skipped: [],
      findings: [],
      inlineComments: [],
      githubReviewId: null,
    });

    expect(capturedArgs?.create.githubReviewId).toBeNull();
  });
});
