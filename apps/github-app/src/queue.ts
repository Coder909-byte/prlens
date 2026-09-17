import { Queue } from "bullmq";
import { createRedisConnection, REVIEW_QUEUE_NAME, type ReviewJobData } from "@prlens/shared";

export const reviewQueue = new Queue<ReviewJobData>(REVIEW_QUEUE_NAME, {
  connection: createRedisConnection(),
});

/**
 * jobId is `${owner}/${repo}#${pullNumber}@${headSha}` so re-delivering the
 * same webhook (GitHub retries, or a duplicate synchronize) for a commit
 * that's already queued/running/recently-completed is a no-op: BullMQ
 * refuses to add a second job under a jobId that still exists in Redis.
 */
export function buildJobId(data: ReviewJobData): string {
  return `${data.owner}/${data.repo}#${data.pullNumber}@${data.headSha}`;
}

export async function enqueueReviewJob(data: ReviewJobData): Promise<void> {
  await reviewQueue.add("review", data, {
    jobId: buildJobId(data),
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
  });
}
