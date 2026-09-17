import { Worker } from "bullmq";
import { createRedisConnection, logger, REVIEW_QUEUE_NAME, type ReviewJobData } from "@prlens/shared";
import { processReviewJob } from "./reviewPullRequest.js";

// Hardcoded to 1: the default LLM provider (and any free-tier key on the
// others) has tight per-minute rate limits, so we process one review at a
// time rather than adding another config knob that just gets set to 1 anyway.
const CONCURRENCY = 1;

const worker = new Worker<ReviewJobData>(REVIEW_QUEUE_NAME, processReviewJob, {
  connection: createRedisConnection(),
  concurrency: CONCURRENCY,
});

worker.on("completed", (job) => {
  logger.info({ jobId: job.id }, "review job completed");
});

worker.on("failed", (job, err) => {
  logger.error({ jobId: job?.id, err }, "review job failed");
});
