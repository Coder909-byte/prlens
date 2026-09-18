import { prisma } from "@prlens/db";
import { createPgBoss, ensureReviewQueue, buildReviewJobKey, REVIEW_QUEUE_NAME, type ReviewJobData } from "@prlens/shared";

export const boss = createPgBoss();

let started: Promise<void> | undefined;

/** Called once at process startup (see index.ts) - exported so index.ts can await it before serving. */
export async function startQueue(): Promise<void> {
  if (!started) {
    started = boss.start().then(() => ensureReviewQueue(boss));
  }
  await started;
}

export type EnqueueResult = "enqueued" | "skipped-already-reviewed";

/**
 * Two layers of dedup, so the same commit is never reviewed twice:
 * 1. A completed Review row for this owner/repo/pullNumber/headSha already
 *    exists (permanent - survives job history retention).
 * 2. Otherwise, send() with a singletonKey on the "exclusive" review-jobs
 *    queue refuses a second job while one is already queued/active for this
 *    key (handles duplicate/near-simultaneous webhook deliveries).
 */
export async function enqueueReviewJob(data: ReviewJobData): Promise<EnqueueResult> {
  const existing = await prisma.review.findUnique({
    where: {
      owner_repo_pullNumber_headSha: {
        owner: data.owner,
        repo: data.repo,
        pullNumber: data.pullNumber,
        headSha: data.headSha,
      },
    },
    select: { id: true },
  });
  if (existing) return "skipped-already-reviewed";

  await boss.send(REVIEW_QUEUE_NAME, data, { singletonKey: buildReviewJobKey(data) });
  return "enqueued";
}
