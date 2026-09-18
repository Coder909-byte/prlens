import { PgBoss } from "pg-boss";
import { config } from "./config.js";
import type { ReviewJobData } from "./types.js";

export const REVIEW_QUEUE_NAME = "review-jobs";

/**
 * pg-boss connection, backed by Neon. Uses DIRECT_URL (not the pooled
 * DATABASE_URL) because pg-boss manages its own schema/migrations and long-
 * lived polling connections, which a transaction-mode pooler can break.
 * Runs in its own "pgboss" schema so its tables never collide with Prisma's.
 * `max` is kept low since this shares a small Neon compute with Prisma.
 */
export function createPgBoss(): PgBoss {
  return new PgBoss({
    connectionString: config.DIRECT_URL,
    schema: "pgboss",
    max: 5,
  });
}

/**
 * `exclusive` + a per-job singletonKey means at most one job for a given key
 * may be queued OR active at a time - a second send() with the same key
 * while one is still pending/running is a no-op. Combined with retries,
 * this is pg-boss's equivalent of BullMQ's jobId-based dedup + backoff.
 */
export async function ensureReviewQueue(boss: PgBoss): Promise<void> {
  await boss.createQueue(REVIEW_QUEUE_NAME, {
    policy: "exclusive",
    retryLimit: 3,
    retryDelay: 5,
    retryBackoff: true,
  });
}

/** Stable per-commit key: never review the same owner/repo/PR/headSha twice. */
export function buildReviewJobKey(data: ReviewJobData): string {
  return `${data.owner}/${data.repo}#${data.pullNumber}@${data.headSha}`;
}
