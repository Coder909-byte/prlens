import Link from "next/link";
import { prisma, FindingSeverity, ReviewMode, type Review, type Finding } from "@prlens/db";
import { Sidebar } from "@/components/sidebar";
import { SeverityDot } from "@/components/severity-badge";
import { ModeBadge, modeLabel } from "@/components/mode-badge";
import { SearchBox } from "@/components/search-box";
import { percentile } from "@/lib/percentile";
import { formatCost, formatLatency, formatTimestamp } from "@/lib/format";

// Always reads live DB state and URL search params - never build-time static.
export const dynamic = "force-dynamic";

type ReviewWithFindings = Review & { findings: Finding[] };

const SEVERITY_ORDER = [FindingSeverity.CRITICAL, FindingSeverity.HIGH, FindingSeverity.MEDIUM, FindingSeverity.LOW] as const;
const SORTABLE = ["repo", "pr", "findings", "cost", "latency", "provider", "model", "mode", "ts"] as const;
type SortKey = (typeof SORTABLE)[number];
const PAGE_SIZE = 100;

function sortValue(r: ReviewWithFindings, key: SortKey): string | number {
  switch (key) {
    case "repo":
      return `${r.owner}/${r.repo}`;
    case "pr":
      return r.pullNumber;
    case "findings":
      return r.findings.length;
    case "cost":
      return r.costUsd ? Number(r.costUsd) : -1;
    case "latency":
      return r.latencyMs;
    case "provider":
      return r.llmProvider;
    case "model":
      return r.llmModel;
    case "mode":
      return r.mode;
    case "ts":
      return r.createdAt.getTime();
  }
}

export default async function ReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; mode?: string; provider?: string; repo?: string; sort?: string; dir?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const q = sp.q?.trim().toLowerCase() ?? "";
  const modeFilter = sp.mode === "diff-only" ? ReviewMode.DIFF_ONLY : sp.mode === "repo-aware" ? ReviewMode.REPO_AWARE : null;
  const providerFilter = sp.provider ?? null;
  const repoFilter = sp.repo ?? null;
  const sortKey: SortKey = SORTABLE.includes(sp.sort as SortKey) ? (sp.sort as SortKey) : "ts";
  const dir = sp.dir === "asc" ? 1 : -1;
  const page = Math.max(1, Number(sp.page) || 1);

  const all = (await prisma.review.findMany({ orderBy: { createdAt: "desc" }, include: { findings: true } })) as ReviewWithFindings[];

  const providers = [...new Set(all.map((r) => r.llmProvider))].sort();
  const repos = [...new Set(all.map((r) => `${r.owner}/${r.repo}`))].sort();

  let filtered = all;
  if (modeFilter) filtered = filtered.filter((r) => r.mode === modeFilter);
  if (providerFilter) filtered = filtered.filter((r) => r.llmProvider === providerFilter);
  if (repoFilter) filtered = filtered.filter((r) => `${r.owner}/${r.repo}` === repoFilter);
  if (q) {
    filtered = filtered.filter((r) => `${r.owner}/${r.repo}`.toLowerCase().includes(q) || String(r.pullNumber).includes(q) || r.llmModel.toLowerCase().includes(q) || r.llmProvider.toLowerCase().includes(q));
  }

  const sorted = [...filtered].sort((a, b) => {
    const x = sortValue(a, sortKey);
    const y = sortValue(b, sortKey);
    if (typeof x === "string") return x.localeCompare(y as string) * dir;
    return ((x as number) - (y as number)) * dir;
  });

  const start = (page - 1) * PAGE_SIZE;
  const pageRows = sorted.slice(start, start + PAGE_SIZE);

  const totalFindings = all.reduce((sum, r) => sum + r.findings.length, 0);
  const totalCost = all.map((r) => r.costUsd).filter((c): c is NonNullable<typeof c> => c !== null).map(Number).reduce((a, b) => a + b, 0);
  const p50 = percentile(all.map((r) => r.latencyMs), 50);

  function buildHref(overrides: Record<string, string | null>): string {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (sp.mode) params.set("mode", sp.mode);
    if (providerFilter) params.set("provider", providerFilter);
    if (repoFilter) params.set("repo", repoFilter);
    if (sp.sort) params.set("sort", sp.sort);
    if (sp.dir) params.set("dir", sp.dir);
    for (const [k, v] of Object.entries(overrides)) {
      if (v === null) params.delete(k);
      else params.set(k, v);
    }
    const s = params.toString();
    return s ? `/reviews?${s}` : "/reviews";
  }

  function sortHref(key: SortKey): string {
    const nextDir = sortKey === key && dir === -1 ? "asc" : "desc";
    return buildHref({ sort: key, dir: nextDir, page: null });
  }

  const activeFilters: { label: string; clearHref: string }[] = [];
  if (sp.mode) activeFilters.push({ label: `mode: ${sp.mode}`, clearHref: buildHref({ mode: null }) });
  if (providerFilter) activeFilters.push({ label: `provider: ${providerFilter}`, clearHref: buildHref({ provider: null }) });
  if (repoFilter) activeFilters.push({ label: `repo: ${repoFilter}`, clearHref: buildHref({ repo: null }) });

  return (
    <div className="flex min-h-screen bg-bg text-[13px] text-text">
      <Sidebar activePath="/reviews" />
      <main className="flex grow flex-col gap-4 p-7 px-8">
        <header className="flex items-end justify-between gap-4">
          <div className="flex flex-col gap-1">
            <span className="font-mono text-[12px] text-text-dim">all repos</span>
            <h1 className="text-[22px] font-semibold tracking-[-0.015em] text-text-strong">Reviews</h1>
          </div>
          <div className="flex gap-4 font-mono text-[12px] text-text-faint">
            <span>
              <span className="text-text-strong">{all.length}</span> reviews
            </span>
            <span>
              <span className="text-text-strong">{totalFindings}</span> findings
            </span>
            <span>
              <span className="text-text-strong">{formatCost(totalCost)}</span> spent
            </span>
            <span>
              p50 <span className="text-text-strong">{formatLatency(p50)}</span>
            </span>
          </div>
        </header>

        <div className="flex flex-wrap items-center gap-2.5">
          <SearchBox initialQuery={q} />
          <div role="group" aria-label="Mode" className="flex overflow-hidden rounded-[5px] border border-border-strong">
            <Link href={buildHref({ mode: null })} aria-pressed={!sp.mode} className={`px-3 py-1.5 text-[12px] ${!sp.mode ? "bg-[#1d232b] text-text-strong" : "bg-surface text-text-tertiary"}`}>
              All modes
            </Link>
            <Link href={buildHref({ mode: "diff-only" })} aria-pressed={sp.mode === "diff-only"} className={`border-l border-border-strong px-3 py-1.5 font-mono text-[12px] ${sp.mode === "diff-only" ? "bg-[#1d232b] text-text-strong" : "bg-surface text-mode-diff-only"}`}>
              diff-only
            </Link>
            <Link href={buildHref({ mode: "repo-aware" })} aria-pressed={sp.mode === "repo-aware"} className={`border-l border-border-strong px-3 py-1.5 font-mono text-[12px] ${sp.mode === "repo-aware" ? "bg-[#1d232b] text-text-strong" : "bg-surface text-accent"}`}>
              repo-aware
            </Link>
          </div>
          {activeFilters.map((f) => (
            <Link key={f.label} href={f.clearHref} className="rounded-[5px] border border-border-strong bg-[#171b21] px-2 py-1 font-mono text-[11px] text-text-secondary">
              {f.label} ×
            </Link>
          ))}
        </div>

        <section aria-label="Reviews table" className="flex flex-col overflow-hidden rounded-card border border-border bg-surface">
          <div className="grid grid-cols-[minmax(0,1.4fr)_64px_170px_88px_84px_84px_minmax(0,1.5fr)_108px_132px] border-b border-border-strong bg-surface-header">
            {SORTABLE.map((key) => (
              <Link
                key={key}
                href={sortHref(key)}
                className={`flex h-[34px] items-center gap-1 px-3 font-mono text-[11px] lowercase tracking-[0.02em] ${sortKey === key ? "text-text-strong" : "text-text-faint"} ${
                  key === "pr" || key === "findings" || key === "cost" || key === "latency" || key === "ts" ? "justify-end" : "justify-start"
                }`}
              >
                {key}
                <span className="w-2 text-accent">{sortKey === key ? (dir === -1 ? "↓" : "↑") : ""}</span>
              </Link>
            ))}
          </div>

          {pageRows.length === 0 ? (
            <NoMatches total={all.length} activeFilters={activeFilters} />
          ) : (
            pageRows.map((r, i) => (
              <Link
                key={r.id}
                href={`/reviews/${r.id}`}
                className="grid grid-cols-[minmax(0,1.4fr)_64px_170px_88px_84px_84px_minmax(0,1.5fr)_108px_132px] items-center border-b border-border-row font-mono text-[12px] text-text-secondary"
                style={{ height: 36, background: i % 2 ? "#14181d" : "var(--color-surface)" }}
              >
                <span className="overflow-hidden text-ellipsis whitespace-nowrap px-3 text-text-strong">
                  <span className="text-text-dimmer">{r.owner}/</span>
                  {r.repo}
                </span>
                <span className="px-3 text-right text-accent-link">#{r.pullNumber}</span>
                <div className="flex items-center justify-end gap-2.5 px-3">
                  <div className="flex h-1.5 w-[72px] gap-0.5">
                    {SEVERITY_ORDER.map((sev) => {
                      const n = r.findings.filter((f) => f.severity === sev).length;
                      return n > 0 ? <span key={sev} className="rounded-sm" style={{ flexGrow: n, background: `var(--color-sev-${sev.toLowerCase()})` }} /> : null;
                    })}
                  </div>
                  <span className="w-[18px] text-right" style={{ color: r.findings.length === 0 ? "var(--color-text-dimmer)" : "var(--color-text-strong)" }}>
                    {r.findings.length}
                  </span>
                </div>
                <span className="px-3 text-right">{formatCost(r.costUsd ? Number(r.costUsd) : null)}</span>
                <span className="px-3 text-right" style={{ color: r.latencyMs > 20000 ? "var(--color-warning)" : "var(--color-text-secondary)" }}>
                  {formatLatency(r.latencyMs)}
                </span>
                <span className="px-3 text-text-muted">{r.llmProvider}</span>
                <span className="overflow-hidden text-ellipsis whitespace-nowrap px-3 text-text-muted">{r.llmModel}</span>
                <span className="px-3">
                  <ModeBadge mode={r.mode} />
                </span>
                <span className="px-3 text-right text-text-faint">{formatTimestamp(r.createdAt)}</span>
              </Link>
            ))
          )}

          <div className="flex items-center justify-center gap-2.5 px-4 py-[18px] text-[12px] text-text-dimmer">
            <span className="h-px w-10 bg-border-strong" />
            <span>End of list · {sorted.length} of {all.length} reviews</span>
            <span className="h-px w-10 bg-border-strong" />
          </div>
        </section>
      </main>
    </div>
  );
}

function NoMatches({ total, activeFilters }: { total: number; activeFilters: { label: string; clearHref: string }[] }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2.5 px-6 py-10 text-center">
      <span className="text-[14px] font-medium text-text-strong">0 of {total} reviews match</span>
      {activeFilters.length > 0 && <span className="max-w-[320px] text-[12px] leading-relaxed text-text-faint">No review matches every active filter at once.</span>}
      <div className="flex gap-2">
        {activeFilters.map((f) => (
          <Link key={f.label} href={f.clearHref} className="rounded-[5px] border border-border-strong bg-[#1d232b] px-3 py-1.5 text-[12px] text-text-strong">
            Remove {f.label.split(":")[0]}
          </Link>
        ))}
        <Link href="/reviews" className="rounded-[5px] border border-border-strong px-3 py-1.5 text-[12px] text-text-muted">
          Clear all
        </Link>
      </div>
    </div>
  );
}
