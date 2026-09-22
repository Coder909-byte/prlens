import type { Job, PgBoss } from "pg-boss";
import { REVIEW_QUEUE_NAME, logger, type ReviewJobData } from "@prlens/shared";
import { isProviderError, summarizeProviderError } from "@prlens/reviewer";
import { processReviewJob } from "./reviewPullRequest.js";

// Hardcoded to 1: the default LLM provider (and any free-tier key on the
// others) has tight per-minute rate limits, so we process one review at a
// time rather than adding another config knob that just gets set to 1 anyway.
const CONCURRENCY = 1;

/**
 * Registers the review-job handler on an already-started pg-boss instance -
 * shared between apps/worker's own standalone process (local dev) and
 * apps/server's combined process (production, one process for Render's
 * free-tier single web service), so both wire up the exact same handler
 * instead of maintaining two copies of it.
 */
export async function registerReviewWorker(boss: PgBoss): Promise<void> {
  await boss.work<ReviewJobData>(
    REVIEW_QUEUE_NAME,
    { batchSize: CONCURRENCY, localConcurrency: CONCURRENCY },
    async ([job]: Job<ReviewJobData>[]) => {
      // batchSize is 1, so pg-boss only invokes this handler with exactly one
      // job; the guard is here purely to satisfy noUncheckedIndexedAccess.
      if (!job) return;
      try {
        await processReviewJob(job);
      } catch (err) {
        // pg-boss catches this to drive its own retry/failed-state bookkeeping
        // and doesn't log it itself - without this, a failed review job is
        // silent (no posted review, no DB row, nothing in the console).
        //
        // An AI SDK RetryError's .errors array holds one full request (the
        // whole diff) per retry attempt - logging it via pino's default `err`
        // serializer dumps that repeatedly. Summarize those; keep the full
        // stack for anything else (GitHub API errors, Prisma errors, etc).
        if (isProviderError(err)) {
          logger.error({ ...summarizeProviderError(err), jobId: job.id, data: job.data }, "review job failed");
        } else {
          logger.error({ err, jobId: job.id, data: job.data }, "review job failed");
        }
        throw err;
      }
    },
  );
}
