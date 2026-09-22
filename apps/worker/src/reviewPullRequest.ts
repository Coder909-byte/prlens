import type { Job } from "pg-boss";
import { config, logger, computeCostUsd, type ReviewJobData } from "@prlens/shared";
import { ReviewStatus, ReviewMode } from "@prlens/db";
import {
  filterDiffFiles,
  parseDiffHunks,
  runDiffOnlyReview,
  runRepoAwareReview,
  extractHunks,
  formatReview,
  resolveLanguageModel,
  type Finding,
  type PrFile,
  type ReviewOutcome,
} from "@prlens/reviewer";
import { ensureIndex, cleanupIndex, retrieveContext, type RetrievedContext, type RetrievedItem } from "@prlens/indexer";
import { getInstallationOctokit } from "./github.js";
import { recordReview } from "./db.js";
import { supersedePreviousReview } from "./supersede.js";

// Same default the eval runner (evals/runner/src/index.ts) uses for
// --context-tokens - keeps production and eval retrieval sized the same way
// absent a reason to diverge.
const CONTEXT_TOKENS_PER_HUNK = 2000;

/** The retrieved context whose hunk contains `finding.line` in `finding.file`, if any - a finding can only be matched back to context found in the same file/hunk it was raised in. */
function contextForFinding(finding: Finding, contexts: RetrievedContext[]): RetrievedItem[] | null {
  const match = contexts.find(
    (c) => c.hunk.file === finding.file && finding.line >= c.hunk.startLine && finding.line <= c.hunk.endLine,
  );
  return match && match.items.length > 0 ? match.items : null;
}

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

  const mode = config.ENABLE_REPO_AWARE ? ReviewMode.REPO_AWARE : ReviewMode.DIFF_ONLY;

  let outcome: ReviewOutcome;
  let retrievedContexts: RetrievedContext[] = [];
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
  } else if (mode === ReviewMode.REPO_AWARE) {
    // Head, not base: a symbol (and everything it calls) can be introduced
    // in this same PR, in which case it doesn't exist at base sha at all -
    // smallestOverlapping (packages/indexer/src/retrieve.ts) would then
    // silently resolve the hunk's changedSymbol to an unrelated pre-existing
    // symbol that happens to share the file, instead of finding nothing (or
    // finding a genuinely relevant same-PR caller/callee elsewhere in the
    // repo). Head sha is a strict superset of base for this purpose - every
    // pre-existing caller/callee this was designed to find is still present
    // post-PR unless the PR itself deletes it.
    // Cleaned up in `finally`, not left on disk: a memory/disk-constrained
    // production host (e.g. Render's free tier, 512MB) can't accumulate one
    // repo checkout + parsed index per review indefinitely, and a real PR's
    // headSha is essentially never reviewed twice, so nothing reusable is
    // lost by deleting it right after this review uses it.
    try {
      const index = await ensureIndex(data.owner, data.repo, data.headSha);
      const hunks = extractHunks(included);
      retrievedContexts = hunks.map((hunk) => retrieveContext(index, hunk, CONTEXT_TOKENS_PER_HUNK));
      outcome = await runRepoAwareReview(included, skipped, retrievedContexts);
    } finally {
      cleanupIndex(data.owner, data.repo, data.headSha);
    }
  } else {
    outcome = await runDiffOnlyReview(included, skipped);
  }

  const { body, inlineComments } = formatReview(
    outcome.findings,
    diffLineMap,
    skipped,
    outcome.failed,
    mode === ReviewMode.REPO_AWARE ? "repo-aware" : "diff-only",
  );

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
      mode,
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
      retrievedContext: outcome.findings.map((f) => contextForFinding(f, retrievedContexts)),
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
