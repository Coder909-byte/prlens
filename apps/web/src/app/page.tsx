import Link from "next/link";
import { prisma, FindingSeverity, ReviewMode, type Review, type Finding } from "@prlens/db";
import { Sidebar } from "@/components/sidebar";
import { StatCard } from "@/components/stat-card";
import { SeverityDot } from "@/components/severity-badge";
import { ModeBadge, modeLabel } from "@/components/mode-badge";
import { percentile } from "@/lib/percentile";
import { formatCost, formatLatency, formatTimestamp, formatDateShort } from "@/lib/format";

// Always reads live DB state and the signed-in session - never build-time static.
export const dynamic = "force-dynamic";

type ReviewWithFindings = Review & { findings: Finding[] };

const SEVERITY_ORDER = [FindingSeverity.CRITICAL, FindingSeverity.HIGH, FindingSeverity.MEDIUM, FindingSeverity.LOW] as const;

function groupStats(name: string, list: ReviewWithFindings[], totalReviews: number, color: string) {
  const findings = list.reduce((sum, r) => sum + r.findings.length, 0);
  const costs = list.map((r) => r.costUsd).filter((c): c is NonNullable<typeof c> => c !== null).map(Number);
  const latencies = list.map((r) => r.latencyMs);
  return {
    name,
    color,
    reviews: list.length,
    findings,
    per: list.length ? (findings / list.length).toFixed(1) : "0.0",
    cost: costs.length ? formatCost(costs.reduce((a, b) => a + b, 0) / costs.length) : "—",
    p50: latencies.length ? formatLatency(percentile(latencies, 50)) : "—",
    share: totalReviews ? Math.round((list.length / totalReviews) * 100) : 0,
  };
}

function EmptyOverview({ activePath }: { activePath: string }) {
  return (
    <div className="flex min-h-screen bg-bg text-[13px] text-text">
      <Sidebar activePath={activePath} />
      <main className="flex grow flex-col gap-5 p-7 px-8">
        <header className="flex flex-col gap-1">
          <span className="font-mono text-[12px] text-text-dim">Overview</span>
          <h1 className="text-[22px] font-semibold tracking-[-0.015em] text-text-strong">No reviews yet</h1>
        </header>
        <div className="flex max-w-[560px] flex-col gap-4 rounded-card border border-dashed border-border-dashed p-6">
          <h2 className="text-[16px] font-semibold text-text-strong">Waiting for the first pull request</h2>
          <ol className="flex flex-col gap-2.5 text-text-tertiary">
            <li className="flex items-center gap-2.5">
              <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full border border-border-strong font-mono text-[11px] text-text-faint">1</span>
              Install the GitHub App on a repository
            </li>
            <li className="flex items-center gap-2.5">
              <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full border border-border-dashed font-mono text-[11px] text-text-dim">2</span>
              Open or push to a pull request
            </li>
            <li className="flex items-center gap-2.5 text-text-faint">
              <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full border border-border-dashed font-mono text-[11px] text-text-dimmer">3</span>
              Findings appear here and on the PR
            </li>
          </ol>
        </div>
      </main>
    </div>
  );
}

export default async function MainPage() {
  const reviews = (await prisma.review.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { findings: true },
  })) as ReviewWithFindings[];

  if (reviews.length === 0) {
    return <EmptyOverview activePath="/" />;
  }

  const allFindings = reviews.flatMap((r) => r.findings);
  const sevCounts = SEVERITY_ORDER.map((sev) => allFindings.filter((f) => f.severity === sev).length);
  const costs = reviews.map((r) => r.costUsd).filter((c): c is NonNullable<typeof c> => c !== null).map(Number);
  const latencies = reviews.map((r) => r.latencyMs);
  const p50 = percentile(latencies, 50);
  const p95 = percentile(latencies, 95);
  const repos = new Set(reviews.map((r) => `${r.owner}/${r.repo}`));
  const oldestInWindow = reviews[reviews.length - 1]!;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Array.from({ length: 14 }, (_, i) => {
    const start = new Date(today);
    start.setDate(start.getDate() - (13 - i));
    const end = new Date(start);
    end.setDate(start.getDate() + 1);
    const n = reviews.filter((r) => r.createdAt >= start && r.createdAt < end).length;
    return { label: i === 13 ? "today" : formatDateShort(start), n };
  });
  const activeDays = days.filter((d) => d.n > 0).length;
  const maxN = Math.max(1, ...days.map((d) => d.n));

  const byProvider = new Map<string, ReviewWithFindings[]>();
  const byMode = new Map<ReviewMode, ReviewWithFindings[]>();
  for (const r of reviews) {
    byProvider.set(r.llmProvider, [...(byProvider.get(r.llmProvider) ?? []), r]);
    byMode.set(r.mode, [...(byMode.get(r.mode) ?? []), r]);
  }
  const providerRows = [...byProvider.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([name, list]) => groupStats(name, list, reviews.length, "var(--color-text-tertiary)"));
  const modeRows = [...byMode.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([mode, list]) => groupStats(modeLabel(mode), list, reviews.length, mode === ReviewMode.REPO_AWARE ? "var(--color-accent)" : "var(--color-mode-diff-only)"));

  const bothModesPrs = new Set(
    [...new Map(reviews.map((r) => [`${r.owner}/${r.repo}#${r.pullNumber}`, reviews.filter((x) => x.owner === r.owner && x.repo === r.repo && x.pullNumber === r.pullNumber)])).entries()].filter(
      ([, list]) => new Set(list.map((r) => r.mode)).size > 1,
    ),
  ).size;

  const recent = reviews.slice(0, 5);

  return (
    <div className="flex min-h-screen bg-bg text-[13px] text-text">
      <Sidebar activePath="/" />
      <main className="flex grow flex-col gap-5 p-7 px-8">
        <header className="flex items-end justify-between gap-4">
          <div className="flex flex-col gap-1">
            <span className="font-mono text-[12px] text-text-dim">all repos</span>
            <h1 className="text-[22px] font-semibold tracking-[-0.015em] text-text-strong">Overview</h1>
          </div>
        </header>

        <section aria-label="Totals" className="grid grid-cols-5 gap-3">
          <StatCard label="Total reviews" value={String(reviews.length)} sub={`${repos.size} repo${repos.size === 1 ? "" : "s"} · first on ${formatDateShort(oldestInWindow.createdAt)}`} />
          <StatCard label="Total findings" value={String(allFindings.length)}>
            <div className="flex flex-col gap-1.5">
              <div className="flex h-1 gap-0.5 overflow-hidden rounded-sm">
                {SEVERITY_ORDER.map((sev, i) => (
                  <span key={sev} className="h-1" style={{ flexGrow: sevCounts[i] || 0.0001, background: `var(--color-sev-${sev.toLowerCase()})` }} />
                ))}
              </div>
              <span className="font-mono text-[11px] text-text-faint">
                {sevCounts[0]} crit · {sevCounts[1]} high · {sevCounts[2]} med · {sevCounts[3]} low
              </span>
            </div>
          </StatCard>
          <StatCard label="Avg cost / review" value={formatCost(costs.length ? costs.reduce((a, b) => a + b, 0) / costs.length : null)} sub={costs.length ? `${formatCost(costs.reduce((a, b) => a + b, 0))} total` : undefined} />
          <StatCard label="Latency p50" value={formatLatency(p50)} sub={`min ${formatLatency(Math.min(...latencies))}`} />
          <StatCard label="Latency p95" value={formatLatency(p95)} sub={`n = ${reviews.length}`} />
        </section>

        <section aria-label="Reviews per day" className="flex flex-col gap-2.5 rounded-card border border-border bg-surface px-4 pb-3 pt-3.5">
          <div className="flex items-baseline justify-between">
            <h2 className="text-[13px] font-medium text-text-secondary">Reviews per day</h2>
            <span className="font-mono text-[11px] text-text-dim">{activeDays} active days of 14</span>
          </div>
          <div className="grid grid-cols-[repeat(14,minmax(0,1fr))] gap-1.5">
            {days.map((d, i) => (
              <div key={i} className="flex flex-col items-center gap-1.5">
                <div className="flex h-11 w-full items-end justify-center">
                  {d.n === 0 ? (
                    <span className="h-1 w-1 rounded-sm bg-[#2b313a]" />
                  ) : (
                    <div className="flex w-full max-w-[44px] justify-center rounded-t-[3px] bg-accent/85" style={{ height: `${Math.max(8, (d.n / maxN) * 44)}px` }}>
                      <span className="pt-0.5 font-mono text-[10px] font-semibold text-accent-fg">{d.n}</span>
                    </div>
                  )}
                </div>
                <span className={`font-mono text-[10px] ${d.label === "today" ? "text-text-tertiary" : "text-text-dimmer"}`}>{d.label}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="grid grid-cols-2 gap-3">
          <BreakdownTable title="By provider" rows={providerRows} />
          <BreakdownTable title="By review mode" rows={modeRows} footnote={bothModesPrs > 0 ? `${bothModesPrs} PR${bothModesPrs === 1 ? "" : "s"} reviewed in both modes. ` : undefined} footnoteLink />
        </section>

        <section className="flex flex-col rounded-card border border-border bg-surface">
          <div className="flex items-baseline justify-between border-b border-border-header px-4 py-2.5 pt-3.5">
            <h2 className="text-[13px] font-medium text-text-secondary">Recent reviews</h2>
            <Link href="/reviews" className="text-[12px]">
              View all {reviews.length} →
            </Link>
          </div>
          {recent.map((r) => (
            <Link
              key={r.id}
              href={`/reviews/${r.id}`}
              className="grid grid-cols-[112px_minmax(0,1fr)_104px_150px_76px_60px] items-center gap-3 border-b border-border-row px-4 py-2.5 text-text-secondary"
            >
              <span className="font-mono text-[12px] text-text-dim">{formatTimestamp(r.createdAt)}</span>
              <div className="flex min-w-0 items-baseline gap-2.5">
                <span className="whitespace-nowrap font-mono text-[12px] text-text-strong">
                  {r.owner}/{r.repo} <span className="text-accent-link">#{r.pullNumber}</span>
                </span>
              </div>
              <ModeBadge mode={r.mode} />
              <span className="overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[12px] text-text-muted">
                {r.llmProvider} · {r.llmModel}
              </span>
              <span className="text-right font-mono text-[12px]">{formatCost(r.costUsd ? Number(r.costUsd) : null)}</span>
              <span className="text-right font-mono text-[12px]">{formatLatency(r.latencyMs)}</span>
            </Link>
          ))}
          <div className="px-4 py-2.5 text-[12px] text-text-dim">
            Showing the {recent.length} most recent of {reviews.length}.
          </div>
        </section>
      </main>
    </div>
  );
}

function BreakdownTable({
  title,
  rows,
  footnote,
  footnoteLink,
}: {
  title: string;
  rows: ReturnType<typeof groupStats>[];
  footnote?: string;
  footnoteLink?: boolean;
}) {
  return (
    <div className="flex flex-col rounded-card border border-border bg-surface">
      <div className="flex items-baseline justify-between px-4 pb-2.5 pt-3.5">
        <h2 className="text-[13px] font-medium text-text-secondary">{title}</h2>
        <span className="text-[11px] text-text-dim">bar = share of reviews</span>
      </div>
      <div className="grid grid-cols-[minmax(0,1.6fr)_repeat(5,minmax(0,1fr))] gap-2 border-b border-border-header px-4 py-1.5 font-mono text-[11px] text-text-dim">
        <span>name</span>
        <span className="text-right">reviews</span>
        <span className="text-right">findings</span>
        <span className="text-right">per rev</span>
        <span className="text-right">avg cost</span>
        <span className="text-right">p50</span>
      </div>
      {rows.length === 0 && <div className="px-4 py-3 text-[12px] text-text-dim">No data yet.</div>}
      {rows.map((r) => (
        <div key={r.name} className="grid grid-cols-[minmax(0,1.6fr)_repeat(5,minmax(0,1fr))] items-center gap-2 border-b border-border-row px-4 py-2.5 font-mono text-[12px] text-text-secondary">
          <div className="flex flex-col gap-1.5">
            <span style={{ color: r.color }}>{r.name}</span>
            <div className="h-[3px] rounded-sm bg-border-header">
              <div className="h-[3px] rounded-sm" style={{ width: `${r.share}%`, background: r.color }} />
            </div>
          </div>
          <span className="text-right">{r.reviews}</span>
          <span className="text-right">{r.findings}</span>
          <span className="text-right">{r.per}</span>
          <span className="text-right">{r.cost}</span>
          <span className="text-right">{r.p50}</span>
        </div>
      ))}
      <div className="px-4 pb-3 pt-2.5 text-[12px] text-text-dim">
        {footnote}
        {footnoteLink && (
          <Link href="/benchmark" className="text-[12px]">
            Compare recall on Benchmark →
          </Link>
        )}
        {!footnote && !footnoteLink && "Only entries with at least one review are listed."}
      </div>
    </div>
  );
}
