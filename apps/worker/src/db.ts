import { prisma, FindingSeverity, FindingCategory, ReviewStatus, type Prisma } from "@prlens/db";
import type { Finding, InlineComment, SkippedFile } from "@prlens/reviewer";
import type { ReviewJobData } from "@prlens/shared";

const SEVERITY_MAP: Record<Finding["severity"], FindingSeverity> = {
  critical: FindingSeverity.CRITICAL,
  high: FindingSeverity.HIGH,
  medium: FindingSeverity.MEDIUM,
  low: FindingSeverity.LOW,
};

const CATEGORY_MAP: Record<Finding["category"], FindingCategory> = {
  bug: FindingCategory.BUG,
  security: FindingCategory.SECURITY,
  missing_test: FindingCategory.MISSING_TEST,
  style: FindingCategory.STYLE,
};

export interface RecordReviewInput {
  job: ReviewJobData;
  status: ReviewStatus;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number | null;
  latencyMs: number;
  skipped: SkippedFile[];
  findings: Finding[];
  inlineComments: InlineComment[];
  errorMessage?: string;
}

function wasPostedInline(finding: Finding, inlineComments: InlineComment[]): boolean {
  return inlineComments.some((c) => c.path === finding.file && c.line === finding.line);
}

export async function recordReview(input: RecordReviewInput): Promise<void> {
  const { job } = input;

  const scalarData = {
    status: input.status,
    llmProvider: input.provider,
    llmModel: input.model,
    inputTokens: input.inputTokens,
    outputTokens: input.outputTokens,
    costUsd: input.costUsd,
    latencyMs: input.latencyMs,
    skippedFiles: input.skipped as unknown as Prisma.InputJsonValue,
    errorMessage: input.errorMessage,
  };

  // The pre-enqueue DB check + pg-boss's singletonKey (see queue.ts) mean the
  // `update` branch below should only ever fire on a rare race - it
  // deliberately doesn't recreate findings in that case.
  await prisma.review.upsert({
    where: {
      owner_repo_pullNumber_headSha: {
        owner: job.owner,
        repo: job.repo,
        pullNumber: job.pullNumber,
        headSha: job.headSha,
      },
    },
    create: {
      installationId: BigInt(job.installationId),
      owner: job.owner,
      repo: job.repo,
      pullNumber: job.pullNumber,
      headSha: job.headSha,
      baseSha: job.baseSha,
      ...scalarData,
      findings: {
        create: input.findings.map((f) => ({
          file: f.file,
          line: f.line,
          severity: SEVERITY_MAP[f.severity],
          category: CATEGORY_MAP[f.category],
          explanation: f.explanation,
          suggestedFix: f.suggested_fix,
          confidence: f.confidence,
          postedInline: wasPostedInline(f, input.inlineComments),
        })),
      },
    },
    update: scalarData,
  });
}
