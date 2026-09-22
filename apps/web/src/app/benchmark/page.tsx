import { loadLatestComparisonReport, type AggregateStats, type ComparisonPairRow } from "@/lib/benchmark-report";
import { formatCost, formatLatency } from "@/lib/format";

// force-dynamic keeps this from being statically prerendered at build time
// with whatever reports happen to exist right then. It's still not truly
// "live" in production, though: on Vercel, evals/reports/*.json is bundled
// into the deployed function via outputFileTracingIncludes (next.config.ts)
// - the newest committed report at BUILD time, not the newest one on disk
// at request time. A newly committed report only appears here after the
// next Vercel deploy, not on the next page load.
export const dynamic = "force-dynamic";

function fmtPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

interface MetricSpec {
  key: keyof Pick<AggregateStats, "recall" | "fpPerPr" | "avgCostUsd" | "p50LatencyMs">;
  name: string;
  hint: string;
  better: "lower" | "higher";
  fmt: (a: AggregateStats, b: AggregateStats) => { a: string; b: string; aPct: number; bPct: number };
  delta: (a: AggregateStats, b: AggregateStats) => { text: string; good: boolean | null };
}

const METRICS: MetricSpec[] = [
  {
    key: "recall",
    name: "Recall",
    hint: "share of known bugs caught · higher is better",
    better: "higher",
    fmt: (a, b) => ({ a: fmtPct(a.recall), b: fmtPct(b.recall), aPct: a.recall * 100, bPct: b.recall * 100 }),
    delta: (a, b) => {
      const pts = (b.recall - a.recall) * 100;
      if (pts === 0) return { text: "=", good: null };
      return { text: `${pts > 0 ? "+" : ""}${pts.toFixed(1)} pts`, good: pts > 0 };
    },
  },
  {
    key: "fpPerPr",
    name: "False positives per PR",
    hint: "findings not tied to the bug · lower is better",
    better: "lower",
    fmt: (a, b) => {
      const max = Math.max(a.fpPerPr, b.fpPerPr, 1);
      return { a: a.fpPerPr.toFixed(2), b: b.fpPerPr.toFixed(2), aPct: (a.fpPerPr / max) * 100, bPct: (b.fpPerPr / max) * 100 };
    },
    delta: (a, b) => {
      const diff = b.fpPerPr - a.fpPerPr;
      if (diff === 0) return { text: "=", good: null };
      return { text: `${diff > 0 ? "+" : ""}${diff.toFixed(2)}`, good: diff < 0 };
    },
  },
  {
    key: "avgCostUsd",
    name: "Cost per PR",
    hint: "model spend, average per review",
    better: "lower",
    fmt: (a, b) => {
      const max = Math.max(a.avgCostUsd ?? 0, b.avgCostUsd ?? 0, 0.0001);
      return { a: formatCost(a.avgCostUsd), b: formatCost(b.avgCostUsd), aPct: ((a.avgCostUsd ?? 0) / max) * 100, bPct: ((b.avgCostUsd ?? 0) / max) * 100 };
    },
    delta: (a, b) => {
      if (!a.avgCostUsd || !b.avgCostUsd) return { text: "n/a", good: null };
      const ratio = b.avgCostUsd / a.avgCostUsd;
      return { text: `${ratio.toFixed(1)}×`, good: null };
    },
  },
  {
    key: "p50LatencyMs",
    name: "Latency p50",
    hint: "median time for the review call",
    better: "lower",
    fmt: (a, b) => {
      const max = Math.max(a.p50LatencyMs, b.p50LatencyMs, 1);
      return { a: formatLatency(a.p50LatencyMs), b: formatLatency(b.p50LatencyMs), aPct: (a.p50LatencyMs / max) * 100, bPct: (b.p50LatencyMs / max) * 100 };
    },
    delta: (a, b) => {
      if (!a.p50LatencyMs) return { text: "n/a", good: null };
      return { text: `${(b.p50LatencyMs / a.p50LatencyMs).toFixed(1)}×`, good: null };
    },
  },
];

function confusionMatrix(pairs: ComparisonPairRow[]) {
  const both = pairs.filter((p) => p.diffOnlyCaught && p.repoAwareCaught).length;
  const diffOnly = pairs.filter((p) => p.diffOnlyCaught && !p.repoAwareCaught).length;
  const repoAwareOnly = pairs.filter((p) => !p.diffOnlyCaught && p.repoAwareCaught).length;
  const neither = pairs.filter((p) => !p.diffOnlyCaught && !p.repoAwareCaught).length;
  return { both, diffOnly, repoAwareOnly, neither };
}

export default function BenchmarkPage() {
  const report = loadLatestComparisonReport();

  return (
    <div className="min-h-screen bg-bg-public text-[14px] text-text">
      <header className="flex h-16 items-center justify-between border-b border-border-row px-[120px]">
        <a href="/" className="flex items-center gap-2.5 text-text-strong">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="10.5" cy="10.5" r="6.5" />
            <path d="M15.5 15.5 21 21" />
            <path d="M8 10.5h5" />
          </svg>
          <span className="text-[16px] font-semibold tracking-tight">PRLens</span>
        </a>
        <nav aria-label="Site" className="flex items-center gap-7 text-[13px]">
          <a href="#method" className="text-text-muted">
            Methodology
          </a>
          <a href="https://github.com" className="flex items-center gap-1.5 text-text-muted">
            GitHub
          </a>
        </nav>
      </header>

      <div className="flex flex-col gap-14 px-[120px] pb-14 pt-[72px]">
        {!report ? (
          <NoBenchmarkYet />
        ) : (
          <>
            <section className="flex max-w-[880px] flex-col gap-5">
              <div className="flex flex-wrap gap-x-[18px] gap-y-2 font-mono text-[12px] tracking-[0.02em] text-text-faint">
                <span className="text-accent">BENCHMARK</span>
                <span>run {report.generatedAt.slice(0, 10)}</span>
                <span>{report.overall.diffOnly.pairCount} bug pairs</span>
                <span>
                  {report.provider} · {report.model}
                </span>
              </div>
              <h1 className="m-0 text-[48px] font-semibold leading-[1.08] tracking-[-0.03em] text-text-brightest">Does repository context help an AI reviewer catch real bugs?</h1>
              <p className="m-0 max-w-[760px] text-[17px] leading-relaxed text-text-muted">
                Each pair is a real historical pull request where a bug was introduced and later reverted or fixed. PRLens reviews the introducing PR twice with the same model: once seeing only the diff, once with related code retrieved
                from the rest of the repository. We count which bugs each mode catches and what else it flags.
              </p>
            </section>

            <section aria-labelledby="h-headline" className="flex flex-col gap-4">
              <h2 id="h-headline" className="m-0 text-[13px] font-medium uppercase tracking-[0.08em] text-text-faint">
                Headline results
              </h2>
              <div className="overflow-hidden rounded-[12px] border border-border bg-surface-sunken">
                <div className="grid grid-cols-[minmax(0,1.3fr)_repeat(2,minmax(0,1fr))_minmax(0,0.8fr)] items-end border-b border-border px-7 pb-3.5 pt-[18px]">
                  <span className="text-[12px] text-text-dim">metric</span>
                  <span className="flex items-center gap-2 font-mono text-[13px] text-mode-diff-only">
                    <span className="h-2.5 w-2.5 rounded-[3px] bg-mode-diff-only" />
                    diff-only
                  </span>
                  <span className="flex items-center gap-2 font-mono text-[13px] text-accent">
                    <span className="h-2.5 w-2.5 rounded-[3px] bg-accent" />
                    repo-aware
                  </span>
                  <span className="text-right text-[12px] text-text-dim">repo-aware vs diff-only</span>
                </div>
                {METRICS.map((m) => {
                  const { a, b, aPct, bPct } = m.fmt(report.overall.diffOnly, report.overall.repoAware);
                  const { text: deltaText, good } = m.delta(report.overall.diffOnly, report.overall.repoAware);
                  const isRepeatedRecall = m.key === "recall" && report.repeated;
                  return (
                    <div key={m.key} className="grid grid-cols-[minmax(0,1.3fr)_repeat(2,minmax(0,1fr))_minmax(0,0.8fr)] items-center border-b border-border-row px-7 py-[22px]">
                      <div className="flex flex-col gap-1">
                        <span className="text-[16px] font-medium text-text-strong">{m.name}</span>
                        <span className="text-[12px] text-text-dim">{isRepeatedRecall ? `mean of ${report.repeated!.runsPerPair} runs · higher is better` : m.hint}</span>
                      </div>
                      <div className="flex flex-col gap-2 pr-8">
                        <span className="font-mono text-[30px] font-medium tracking-[-0.02em] text-text-secondary">{a}</span>
                        {isRepeatedRecall && (
                          <span className="text-[11px] text-text-dim">
                            range {fmtPct(report.repeated!.diffOnly.recallMin)}–{fmtPct(report.repeated!.diffOnly.recallMax)}
                          </span>
                        )}
                        <div className="h-1 rounded-sm bg-surface-header">
                          <div className="h-1 rounded-sm bg-mode-diff-only" style={{ width: `${aPct}%` }} />
                        </div>
                      </div>
                      <div className="flex flex-col gap-2 pr-8">
                        <span className="font-mono text-[30px] font-medium tracking-[-0.02em] text-text-brightest">{b}</span>
                        {isRepeatedRecall && (
                          <span className="text-[11px] text-text-dim">
                            range {fmtPct(report.repeated!.repoAware.recallMin)}–{fmtPct(report.repeated!.repoAware.recallMax)}
                          </span>
                        )}
                        <div className="h-1 rounded-sm bg-surface-header">
                          <div className="h-1 rounded-sm bg-accent" style={{ width: `${bPct}%` }} />
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className="font-mono text-[16px] font-medium" style={{ color: good === null ? "var(--color-warning)" : good ? "var(--color-accent)" : "var(--color-warning)" }}>
                          {deltaText}
                        </span>
                        <span className="text-[12px] text-text-dim">{good === null ? "trade-off" : good ? "better" : "worse"}</span>
                      </div>
                    </div>
                  );
                })}
                <div className="flex items-center gap-2.5 bg-surface-deep px-7 py-3.5 text-[13px] text-text-muted">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-warning)" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 8v5M12 16.5v.5" />
                  </svg>
                  {report.repeated ? (
                    report.repeated.rangesOverlap ? (
                      <>
                        Repeated runs ({report.repeated.runsPerPair}× per pair per mode): diff-only's recall range and repo-aware's overlap. At n={report.overall.diffOnly.pairCount}, the two modes are <strong>not distinguishable</strong> on this
                        sample - the mean difference above is within run-to-run model noise, not a real effect.
                      </>
                    ) : (
                      <>
                        Repeated runs ({report.repeated.runsPerPair}× per pair per mode): the recall ranges don&apos;t overlap - the difference above holds up across independent runs, not just one lucky (or unlucky) sample.
                      </>
                    )
                  ) : (
                    <>
                      Small sample: with {report.overall.diffOnly.pairCount} pairs, one bug moves recall by {(100 / report.overall.diffOnly.pairCount).toFixed(1)} points. Treat differences under ~25 points as noise until more pairs land.
                    </>
                  )}
                </div>
              </div>
            </section>

            <ConfusionAndPairs report={report} />

            {report.repeated?.retrievalQuietModelNote && (
              <section aria-labelledby="h-quiet" className="flex max-w-[760px] flex-col gap-2 rounded-[12px] border border-border bg-surface-sunken p-5">
                <h2 id="h-quiet" className="m-0 text-[13px] font-medium uppercase tracking-[0.08em] text-text-faint">
                  Retrieval worked, the model didn&apos;t act on it
                </h2>
                <p className="m-0 text-[13px] leading-relaxed text-text-muted">{report.repeated.retrievalQuietModelNote}</p>
              </section>
            )}

            <section id="method" aria-labelledby="h-method" className="flex flex-col gap-4">
              <h2 id="h-method" className="m-0 text-[13px] font-medium uppercase tracking-[0.08em] text-text-faint">
                Methodology
              </h2>
              <div className="grid grid-cols-3 gap-5">
                <div className="flex flex-col gap-2 border-t border-border-strong pt-4">
                  <h3 className="m-0 text-[15px] font-medium text-text-strong">Where the pairs come from</h3>
                  <p className="m-0 text-[13px] leading-relaxed text-text-muted">
                    Mined from public repo history (git revert and issue-linked fix commits), then filtered (CI config, package manifests, test-only ground truth, same-PR reverts, feature-vs-bug title heuristics) and hand-verified one
                    by one. See the repo README for the full 52 → 19 → {report.overall.diffOnly.pairCount} funnel.
                  </p>
                </div>
                <div className="flex flex-col gap-2 border-t border-border-strong pt-4">
                  <h3 className="m-0 text-[15px] font-medium text-text-strong">Scoring</h3>
                  <p className="m-0 text-[13px] leading-relaxed text-text-muted">A catch is a finding within 5 lines of the bug&apos;s ground-truth range. Every other finding counts as a false positive, even a fair style note.</p>
                </div>
                <div className="flex flex-col gap-2 border-t border-border-strong pt-4">
                  <h3 className="m-0 text-[15px] font-medium text-text-strong">Reproduce</h3>
                  <p className="m-0 text-[13px] leading-relaxed text-text-muted">Pairs and cached outputs are committed. Run it yourself:</p>
                  <code className="rounded-md border border-border bg-surface-sunken px-3 py-2 font-mono text-[12px] text-text-secondary">pnpm eval:compare --split dev --provider {report.provider}</code>
                </div>
              </div>
            </section>
          </>
        )}
      </div>

      <footer className="flex h-16 items-center justify-between border-t border-border-row px-[120px] font-mono text-[12px] text-text-dimmer">
        <span>{report ? `Last run ${report.generatedAt.slice(0, 10)} · results update when pairs are added` : "No benchmark run yet"}</span>
      </footer>
    </div>
  );
}

function ConfusionAndPairs({ report }: { report: NonNullable<ReturnType<typeof loadLatestComparisonReport>> }) {
  const repeated = report.repeated;
  const matrix = repeated
    ? { both: repeated.confusionMatrix.both, diffOnly: repeated.confusionMatrix.diffOnly, repoAwareOnly: repeated.confusionMatrix.repoAwareOnly, neither: repeated.confusionMatrix.neither }
    : confusionMatrix(report.pairs);
  const matrixUnit = repeated ? "run" : "pair";
  const matrixTotal = repeated ? repeated.confusionMatrix.totalComparisons : report.pairs.length;
  return (
    <section aria-labelledby="h-pairs" className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between">
        <h2 id="h-pairs" className="m-0 text-[13px] font-medium uppercase tracking-[0.08em] text-text-faint">
          Which mode caught which bug
        </h2>
        <span className="text-[12px] text-text-dim">
          caught = a finding within 5 lines of the bug that names the defect{repeated ? ` · matrix counts all ${matrixTotal} pair×run comparisons, not pairs` : ""}
        </span>
      </div>
      <div className="grid grid-cols-[320px_minmax(0,1fr)] items-start gap-5">
        <div className="flex flex-col gap-3.5 rounded-[12px] border border-border bg-surface-sunken p-5">
          <div className="grid grid-cols-[64px_repeat(2,minmax(0,1fr))] grid-rows-[auto_repeat(2,88px)] gap-1.5">
            <span />
            <span className="text-center font-mono text-[11px] text-accent">repo-aware ✓</span>
            <span className="text-center font-mono text-[11px] text-text-dim">repo-aware ✗</span>
            <span className="self-center font-mono text-[11px] text-mode-diff-only">diff ✓</span>
            <div className="flex flex-col items-center justify-center gap-0.5 rounded-lg border border-accent/30 bg-accent/[0.14]">
              <span className="font-mono text-[30px] font-medium text-text-brightest">{matrix.both}</span>
              <span className="text-[11px] text-text-muted">both</span>
            </div>
            <div className="flex flex-col items-center justify-center gap-0.5 rounded-lg border border-dashed border-border-dashed">
              <span className="font-mono text-[30px] font-medium text-text-disabled">{matrix.diffOnly}</span>
              <span className="text-[11px] text-text-dimmer">diff only</span>
            </div>
            <span className="self-center font-mono text-[11px] text-text-dim">diff ✗</span>
            <div className="flex flex-col items-center justify-center gap-0.5 rounded-lg border border-accent/50 bg-accent/[0.28]">
              <span className="font-mono text-[30px] font-medium text-text-brightest">{matrix.repoAwareOnly}</span>
              <span className="text-[11px] text-text-secondary">repo-aware only</span>
            </div>
            <div className="flex flex-col items-center justify-center gap-0.5 rounded-lg border border-border bg-surface-header">
              <span className="font-mono text-[30px] font-medium text-text-muted">{matrix.neither}</span>
              <span className="text-[11px] text-text-dim">neither</span>
            </div>
          </div>
          <p className="m-0 text-[13px] leading-relaxed text-text-muted">
            {matrix.repoAwareOnly > 0
              ? `${matrix.repoAwareOnly} ${matrixUnit}${matrix.repoAwareOnly === 1 ? "" : "s"} only repo-aware caught. `
              : ""}
            {matrix.diffOnly > 0 ? `${matrix.diffOnly} ${matrixUnit}${matrix.diffOnly === 1 ? "" : "s"} only diff-only caught. ` : ""}
            {matrix.neither} {matrixUnit}
            {matrix.neither === 1 ? "" : "s"} caught by neither mode.
          </p>
        </div>

        <div className="overflow-hidden rounded-[12px] border border-border bg-surface-sunken">
          <div className="grid grid-cols-[36px_minmax(0,1fr)_100px_84px_84px] gap-3 border-b border-border px-5 py-3 font-mono text-[11px] text-text-dim">
            <span>#</span>
            <span>pair</span>
            <span>method</span>
            <span className="text-center text-mode-diff-only">diff-only</span>
            <span className="text-center text-accent">repo-aware</span>
          </div>
          {report.pairs.map((p, i) => (
            <div key={p.id} className="grid grid-cols-[36px_minmax(0,1fr)_100px_84px_84px] items-center gap-3 border-b border-border-row px-5 py-3.5 last:border-b-0" style={{ background: p.repoAwareCaught && !p.diffOnlyCaught ? "rgba(95,212,166,0.045)" : "transparent" }}>
              <span className="font-mono text-[12px] text-text-dimmer">{String(i + 1).padStart(2, "0")}</span>
              <span className="text-[13px] text-text" title={p.divergenceNote ?? undefined}>
                {p.id}
              </span>
              <span className="font-mono text-[12px] text-text-muted">
                {p.method} · {p.confidence}
              </span>
              <span className="flex justify-center">
                {p.diffOnlyCatchCount !== undefined && p.diffOnlyRuns !== undefined ? (
                  <CatchRateBadge count={p.diffOnlyCatchCount} total={p.diffOnlyRuns} color="var(--color-mode-diff-only)" fg="#0b0d10" />
                ) : (
                  <CaughtBadge caught={p.diffOnlyCaught} color="var(--color-mode-diff-only)" fg="#0b0d10" />
                )}
              </span>
              <span className="flex justify-center">
                {p.repoAwareCatchCount !== undefined && p.repoAwareRuns !== undefined ? (
                  <CatchRateBadge count={p.repoAwareCatchCount} total={p.repoAwareRuns} color="var(--color-accent)" fg="#062117" />
                ) : (
                  <CaughtBadge caught={p.repoAwareCaught} color="var(--color-accent)" fg="#062117" />
                )}
              </span>
            </div>
          ))}
          <div className="grid grid-cols-[36px_minmax(0,1fr)_100px_84px_84px] items-center gap-3 bg-surface-deep px-5 py-3.5 font-mono text-[12px] text-text-faint">
            <span />
            <span>total caught{repeated ? " (majority of runs)" : ""}</span>
            <span />
            <span className="text-center text-text-secondary">
              {report.pairs.filter((p) => p.diffOnlyCaught).length} / {report.pairs.length}
            </span>
            <span className="text-center text-accent">
              {report.pairs.filter((p) => p.repoAwareCaught).length} / {report.pairs.length}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

function CaughtBadge({ caught, color, fg }: { caught: boolean; color: string; fg: string }) {
  return caught ? (
    <span className="rounded-[4px] px-2 py-0.5 font-mono text-[11px]" style={{ color: fg, background: color }}>
      caught
    </span>
  ) : (
    <span className="rounded-[4px] border border-border-dashed px-2 py-0.5 font-mono text-[11px] text-text-dimmer">missed</span>
  );
}

/** "X/N" for a repeated-run report - a solid badge at N/N, a dashed empty badge at 0/N, and a muted fractional badge in between (caught sometimes, not reliably). */
function CatchRateBadge({ count, total, color, fg }: { count: number; total: number; color: string; fg: string }) {
  if (count === 0) {
    return <span className="rounded-[4px] border border-border-dashed px-2 py-0.5 font-mono text-[11px] text-text-dimmer">0/{total}</span>;
  }
  if (count === total) {
    return (
      <span className="rounded-[4px] px-2 py-0.5 font-mono text-[11px]" style={{ color: fg, background: color }}>
        {count}/{total}
      </span>
    );
  }
  return (
    <span className="rounded-[4px] border px-2 py-0.5 font-mono text-[11px]" style={{ borderColor: color, color }}>
      {count}/{total}
    </span>
  );
}

function NoBenchmarkYet() {
  return (
    <section className="flex flex-col items-center gap-3 rounded-[12px] border border-dashed border-border-dashed p-12 text-center">
      <h1 className="m-0 text-[22px] font-semibold text-text-strong">No benchmark run yet</h1>
      <p className="m-0 max-w-[480px] text-[14px] leading-relaxed text-text-muted">
        Run <code className="rounded bg-surface px-1.5 py-0.5 font-mono text-[13px]">pnpm eval:compare --split dev --provider &lt;provider&gt;</code> to generate a comparison report, then reload this page.
      </p>
    </section>
  );
}
