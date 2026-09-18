import { prisma } from "@prlens/db";
import { logger, type ReviewJobData } from "@prlens/shared";
import type { getInstallationOctokit } from "./github.js";

type Octokit = Awaited<ReturnType<typeof getInstallationOctokit>>;

const SUPERSEDED_MARKER = "⚠️ **Superseded by a newer PRLens review on this PR.**";

/**
 * Finds the PR's previous PRLens review (if any) and:
 * 1. Deletes its inline comments that no longer map to a line in the current
 *    diff (GitHub sets `position: null` on a review comment once the diff
 *    changes underneath it - that's the same signal GitHub's own "outdated"
 *    UI uses, so we don't need to recompute diff positions ourselves).
 * 2. Prepends a superseded banner to the review body.
 *
 * This runs before posting the new review, so a PR never shows two "live"
 * PRLens reviews stacked on top of each other - each commit's review
 * replaces the previous one instead of piling on.
 */
export async function supersedePreviousReview(octokit: Octokit, job: ReviewJobData): Promise<void> {
  const log = logger.child({ owner: job.owner, repo: job.repo, pr: job.pullNumber });

  const previous = await prisma.review.findFirst({
    where: { owner: job.owner, repo: job.repo, pullNumber: job.pullNumber, githubReviewId: { not: null } },
    orderBy: { createdAt: "desc" },
    select: { githubReviewId: true },
  });

  if (!previous?.githubReviewId) return;
  // Octokit's REST types want a plain number for review_id; Number() is
  // lossless here since GitHub's IDs are far under Number.MAX_SAFE_INTEGER,
  // it's only Postgres's INT4 that couldn't hold them.
  const reviewId = Number(previous.githubReviewId);

  try {
    const comments = await octokit.paginate(octokit.rest.pulls.listCommentsForReview, {
      owner: job.owner,
      repo: job.repo,
      pull_number: job.pullNumber,
      review_id: reviewId,
      per_page: 100,
    });

    for (const comment of comments) {
      if (comment.position === null) {
        await octokit.rest.pulls
          .deleteReviewComment({ owner: job.owner, repo: job.repo, comment_id: comment.id })
          .catch((err: unknown) => log.warn({ err, commentId: comment.id }, "failed to delete stale review comment"));
      }
    }

    const { data: review } = await octokit.rest.pulls.getReview({
      owner: job.owner,
      repo: job.repo,
      pull_number: job.pullNumber,
      review_id: reviewId,
    });

    if (!review.body?.startsWith(SUPERSEDED_MARKER)) {
      await octokit.rest.pulls.updateReview({
        owner: job.owner,
        repo: job.repo,
        pull_number: job.pullNumber,
        review_id: reviewId,
        body: `${SUPERSEDED_MARKER}\n\n${review.body ?? ""}`,
      });
    }
  } catch (err) {
    // Best-effort: never block posting the new review over cleanup of the old one.
    log.warn({ err, githubReviewId: reviewId }, "failed to supersede previous review");
  }
}
