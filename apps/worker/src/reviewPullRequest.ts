import type { Job } from "pg-boss";
import { config, logger, computeCostUsd, type ReviewJobData } from "@prlens/shared";
import { ReviewStatus } from "@prlens/db";
import {
  filterDiffFiles,
  parseDiffHunks,
  runDiffOnlyReview,
  formatReview,
  resolveLanguageModel,
  type PrFile,
  type ReviewOutcome,
} from "@prlens/reviewer";
import { getInstallationOctokit } from "./github.js";
import { recordReview } from "./db.js";
import { supersedePreviousReview } from "./supersede.js";

export async function processReviewJob(job: Job<ReviewJobData>): Promise<void> {
  const startedAt = Date.now();
  const data = job.data;
  const log = logger.child({ owner: data.owner, repo: data.repo, pr: data.pullNumber, sha: data.headSha });

  const octokit = await getInstallationOctokit(data.installationId);

  const files: PrFile[] = await octokit.paginate(octokit.rest.pulls.listFiles, {
    owner: data.owner,
    repo: data.repo,
    pull_number: data.pullNumber,
    per_page: 100,
  });

  const { included, skipped } = filterDiffFiles(files, config.MAX_DIFF_BYTES);

  const diffLineMap = new Map(included.map((f) => [f.filename, parseDiffHunks(f.patch)]));

  let outcome: ReviewOutcome;
  if (included.length === 0) {
    // Nothing reviewable - skip the LLM call entirely, but still resolve
    // provider/model so the DB record is consistent with a normal review.
    const { provider, modelId } = resolveLanguageModel(config.LLM_PROVIDER, config.LLM_MODEL);
    outcome = {
      findings: [],
      usage: { inputTokens: 0, outputTokens: 0 },
      primaryProvider: provider,
      primaryModel: modelId,
      provider,
      model: modelId,
      failed: false,
    };
  } else {
    outcome = await runDiffOnlyReview(included, skipped);
  }

  const { body, inlineComments } = formatReview(outcome.findings, diffLineMap, skipped, outcome.failed);

  // Mark the PR's previous PRLens review (if any) as superseded and drop its
  // now-stale inline comments, before posting this one - so reviews don't
  // stack up one per commit.
  await supersedePreviousReview(octokit, data);

  let githubReviewId: number | null = null;
  try {
    const { data: review } = await octokit.rest.pulls.createReview({
      owner: data.owner,
      repo: data.repo,
      pull_number: data.pullNumber,
      event: "COMMENT",
      body,
      comments: inlineComments.length > 0 ? inlineComments : undefined,
    });
    githubReviewId = review.id;
  } catch (error) {
    log.error({ err: error }, "createReview with inline comments failed, retrying with body only");
    const { data: review } = await octokit.rest.pulls.createReview({
      owner: data.owner,
      repo: data.repo,
      pull_number: data.pullNumber,
      event: "COMMENT",
      body: `${body}\n\n_(inline comments could not be posted; see worker logs)_`,
    });
    githubReviewId = review.id;
  }

  const latencyMs = Date.now() - startedAt;
  const costUsd = computeCostUsd(outcome.provider, outcome.model, outcome.usage.inputTokens, outcome.usage.outputTokens);

  try {
    await recordReview({
      job: data,
      status: outcome.failed ? ReviewStatus.FAILED : ReviewStatus.SUCCEEDED,
      primaryProvider: outcome.primaryProvider,
      primaryModel: outcome.primaryModel,
      provider: outcome.provider,
      model: outcome.model,
      inputTokens: outcome.usage.inputTokens,
      outputTokens: outcome.usage.outputTokens,
      costUsd,
      latencyMs,
      skipped,
      findings: outcome.findings,
      inlineComments,
      errorMessage: outcome.failed ? "LLM did not return a schema-valid findings object after retrying" : undefined,
      githubReviewId,
    });
  } catch (error) {
    // DB write is best-effort: never fail a review that already posted
    // successfully just because Postgres hiccuped.
    log.error({ err: error }, "failed to record review in DB");
  }

  log.info(
    {
      latencyMs,
      findings: outcome.findings.length,
      failed: outcome.failed,
      primaryProvider: outcome.primaryProvider,
      primaryModel: outcome.primaryModel,
      provider: outcome.provider,
      model: outcome.model,
    },
    "review job completed",
  );
}
