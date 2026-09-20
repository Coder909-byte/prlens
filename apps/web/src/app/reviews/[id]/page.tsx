import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma, FindingSeverity, ReviewMode } from "@prlens/db";
import { Sidebar } from "@/components/sidebar";
import { SeverityBadge, severityDotColor } from "@/components/severity-badge";
import { ModeBadge } from "@/components/mode-badge";
import { formatCost, formatLatency, formatTimestamp } from "@/lib/format";

// Always reads live DB state - never build-time static.
export const dynamic = "force-dynamic";

const SEVERITY_ORDER = [FindingSeverity.CRITICAL, FindingSeverity.HIGH, FindingSeverity.MEDIUM, FindingSeverity.LOW] as const;
const SEVERITY_RANK: Record<FindingSeverity, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

interface RetrievedContextItem {
  kind: "callee-def" | "caller" | "test-reference";
  file: string;
  name: string;
  startLine?: number;
  endLine?: number;
  snippet: string;
}

function parseRetrievedContext(value: unknown): RetrievedContextItem[] {
  if (!value || !Array.isArray(value)) return [];
  return value as RetrievedContextItem[];
}

const KIND_LABEL: Record<RetrievedContextItem["kind"], string> = {
  "callee-def": "definition it calls",
  caller: "caller of this code",
  "test-reference": "test reference",
};

export default async function ReviewDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const review = await prisma.review.findUnique({ where: { id }, include: { findings: true } });
  if (!review) notFound();

  const findings = [...review.findings].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
  const severityCounts = SEVERITY_ORDER.map((sev) => ({ sev, n: findings.filter((f) => f.severity === sev).length }));

  const otherModeReview = await prisma.review.findFirst({
    where: { owner: review.owner, repo: review.repo, pullNumber: review.pullNumber, mode: review.mode === ReviewMode.REPO_AWARE ? ReviewMode.DIFF_ONLY : ReviewMode.REPO_AWARE },
    orderBy: { createdAt: "desc" },
  });

  const filesChanged = [...new Set(findings.map((f) => f.file))];
  const skipped = Array.isArray(review.skippedFiles) ? (review.skippedFiles as { filename: string; reason: string }[]) : [];

  return (
    <div className="flex min-h-screen bg-bg text-[13px] text-text">
      <Sidebar activePath="/reviews" />
      <main className="flex grow flex-col gap-5 p-6 px-8 pb-10">
        <Link href="/reviews" className="self-start text-[12px] text-text-faint">
          ← Reviews
        </Link>

        <header className="flex flex-col gap-3 border-b border-border-header pb-5">
          <a href={`https://github.com/${review.owner}/${review.repo}/pull/${review.pullNumber}`} target="_blank" rel="noopener noreferrer" className="inline-flex w-fit items-center gap-2 font-mono text-[13px]">
            github.com/{review.owner}/{review.repo}/pull/{review.pullNumber}
          </a>
          <h1 className="text-[22px] font-semibold tracking-[-0.015em] text-text-strong">
            {review.owner}/{review.repo} #{review.pullNumber}
          </h1>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 font-mono text-[12px] text-text-faint">
            <ModeBadge mode={review.mode} />
            <span>
              {review.llmProvider} · {review.llmModel}
            </span>
            <span className="text-text-strong">{formatCost(review.costUsd ? Number(review.costUsd) : null)}</span>
            <span className="text-text-strong">{formatLatency(review.latencyMs)}</span>
            <span>
              head <span className="text-text-secondary">{review.headSha.slice(0, 7)}</span>
            </span>
            <span>{formatTimestamp(review.createdAt)}</span>
          </div>
        </header>

        <div className="flex items-start gap-6">
          <section aria-label="Findings" className="flex min-w-0 grow flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-baseline gap-2.5">
                <h2 className="text-[15px] font-semibold text-text-strong">
                  {findings.length} finding{findings.length === 1 ? "" : "s"}
                </h2>
                {findings.length > 0 && <span className="text-[12px] text-text-dim">sorted by severity</span>}
              </div>
              <div className="flex gap-1.5 font-mono text-[11px]">
                {severityCounts
                  .filter((s) => s.n > 0)
                  .map((s) => (
                    <span key={s.sev} className="flex items-center gap-1.5 rounded-[4px] border border-border-strong bg-surface px-2 py-1 text-text-secondary">
                      <span className="h-[7px] w-[7px] rounded-[2px]" style={{ background: severityDotColor(s.sev) }} />
                      {s.sev.toLowerCase()} {s.n}
                    </span>
                  ))}
              </div>
            </div>

            {findings.length === 0 ? (
              <NoFindings review={review} />
            ) : (
              findings.map((f) => {
                const ctx = parseRetrievedContext(f.retrievedContext);
                return (
                  <article key={f.id} className="overflow-hidden rounded-card border border-border">
                    <div className="flex items-center gap-2.5 border-b border-border-header bg-surface-header-alt px-4 py-3">
                      <SeverityBadge severity={f.severity} />
                      <span className="rounded-[4px] bg-[#1b2027] px-[7px] py-0.5 font-mono text-[11px] text-text-muted">{f.category.toLowerCase()}</span>
                      <h3 className="min-w-0 grow text-[14px] font-medium text-text-strong">{f.explanation.split(".")[0]}</h3>
                      <span className="whitespace-nowrap font-mono text-[12px] text-text-faint">
                        {f.file}:{f.line}
                      </span>
                    </div>
                    <div className="flex flex-col gap-3.5 px-4 pb-4 pt-3.5">
                      <p className="m-0 max-w-[760px] text-[13px] leading-relaxed text-text-tertiary">{f.explanation}</p>
                      {f.suggestedFix && (
                        <div className="flex flex-col gap-1.5">
                          <span className="text-[11px] uppercase tracking-[0.07em] text-text-faint">Suggested fix</span>
                          <pre className="whitespace-pre-wrap rounded-md border border-border-header bg-code-bg px-3 py-2 font-mono text-[12px] leading-relaxed text-text-tertiary">{f.suggestedFix}</pre>
                        </div>
                      )}
                      {ctx.length > 0 ? (
                        <details className="overflow-hidden rounded-md border border-border">
                          <summary className="flex cursor-pointer list-none items-center gap-2.5 bg-surface-sunken px-3 py-2">
                            <span className="font-mono text-[10px] text-accent">▸</span>
                            <span className="text-[12px] text-text-secondary">Retrieved context</span>
                            <span className="grow overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[11px] text-text-dim">
                              {ctx.length} item{ctx.length === 1 ? "" : "s"} · {ctx.map((c) => c.file).join(", ")}
                            </span>
                          </summary>
                          <div className="flex flex-col border-t border-border-header">
                            {ctx.map((c, i) => (
                              <div key={i} className="flex flex-col border-b border-border-row last:border-b-0">
                                <div className="flex items-center gap-3 bg-surface-deep px-3 py-1.5 font-mono text-[11px] text-text-faint">
                                  <span className="text-text-secondary">{c.file}</span>
                                  {c.startLine !== undefined && (
                                    <span>
                                      L{c.startLine}–{c.endLine}
                                    </span>
                                  )}
                                  <span className="ml-auto">{KIND_LABEL[c.kind]}</span>
                                </div>
                                <pre className="whitespace-pre-wrap bg-code-bg px-3 py-2 font-mono text-[12px] leading-relaxed text-text-tertiary">{c.snippet}</pre>
                              </div>
                            ))}
                          </div>
                        </details>
                      ) : (
                        <div className="flex items-center gap-2.5 rounded-md border border-dashed border-border-strong px-3 py-2 text-[12px] text-text-dim">
                          <span className="font-mono">–</span>
                          No context retrieved for this hunk. The finding is local to the diff.
                        </div>
                      )}
                    </div>
                  </article>
                );
              })
            )}
          </section>

          <aside aria-label="Run details" className="flex w-[300px] shrink-0 flex-col gap-3">
            <div className="flex flex-col gap-3 rounded-card border border-border bg-surface p-3.5">
              <h2 className="text-[13px] font-medium text-text-secondary">Run</h2>
              <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 font-mono text-[12px]">
                <dt className="text-text-dim">tokens in</dt>
                <dd className="m-0 text-right text-text-secondary">{review.inputTokens.toLocaleString()}</dd>
                <dt className="text-text-dim">tokens out</dt>
                <dd className="m-0 text-right text-text-secondary">{review.outputTokens.toLocaleString()}</dd>
                <dt className="text-text-dim">cost</dt>
                <dd className="m-0 text-right text-text-strong">{formatCost(review.costUsd ? Number(review.costUsd) : null)}</dd>
                <dt className="text-text-dim">latency</dt>
                <dd className="m-0 text-right text-text-secondary">{formatLatency(review.latencyMs)}</dd>
                <dt className="text-text-dim">status</dt>
                <dd className="m-0 text-right text-text-secondary">{review.status.toLowerCase()}</dd>
                {review.githubReviewId && (
                  <>
                    <dt className="text-text-dim">comments posted</dt>
                    <dd className="m-0 text-right text-text-secondary">{findings.filter((f) => f.postedInline).length} inline</dd>
                  </>
                )}
              </dl>
              {review.errorMessage && <p className="m-0 text-[12px] leading-relaxed text-sev-critical-fg">{review.errorMessage}</p>}
            </div>

            {(filesChanged.length > 0 || skipped.length > 0) && (
              <div className="flex flex-col gap-2.5 rounded-card border border-border bg-surface p-3.5">
                <h2 className="text-[13px] font-medium text-text-secondary">Files with findings</h2>
                {filesChanged.map((f) => (
                  <div key={f} className="flex items-center gap-2 font-mono text-[12px] text-text-secondary">
                    <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap">{f}</span>
                  </div>
                ))}
                {skipped.length > 0 && <span className="text-[11px] text-text-dim">{skipped.length} file{skipped.length === 1 ? "" : "s"} skipped (not reviewable - lockfile, generated, binary, or size cap)</span>}
              </div>
            )}

            <div className="flex flex-col gap-2 rounded-card border border-border bg-surface p-3.5">
              <h2 className="text-[13px] font-medium text-text-secondary">Same PR, other mode</h2>
              {otherModeReview ? (
                <>
                  <span className="text-[12px] leading-relaxed text-text-dim">This PR was also reviewed {otherModeReview.mode === ReviewMode.REPO_AWARE ? "repo-aware" : "diff-only"}.</span>
                  <Link href={`/reviews/${otherModeReview.id}`} className="self-start rounded-[5px] border border-border-strong bg-[#1d232b] px-3 py-1.5 text-[12px] text-text-strong">
                    View that review →
                  </Link>
                </>
              ) : (
                <span className="text-[12px] leading-relaxed text-text-dim">
                  This PR has only been reviewed {review.mode === ReviewMode.REPO_AWARE ? "repo-aware" : "diff-only"} so far.
                </span>
              )}
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}

function NoFindings({ review }: { review: { inputTokens: number; outputTokens: number; githubReviewId: bigint | null } }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3.5 rounded-card border border-border bg-surface p-6 text-center">
      <div className="flex items-center gap-2.5">
        <span className="flex h-7 w-7 items-center justify-center rounded-full border border-accent/35 bg-accent/12">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m5 12 5 5 9-10" />
          </svg>
        </span>
        <span className="text-[15px] font-medium text-text-strong">No findings</span>
      </div>
      <p className="m-0 max-w-[360px] text-[12px] leading-relaxed text-text-muted">Nothing was flagged. {review.inputTokens.toLocaleString()} input tokens were reviewed.</p>
      {!review.githubReviewId && <span className="text-[12px] text-text-dim">No comment was posted on the PR.</span>}
    </div>
  );
}
