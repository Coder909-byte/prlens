const SANS = "var(--font-geist-sans), system-ui, sans-serif";
const MONO = "var(--font-geist-mono), ui-monospace, monospace";
const ACCENT = "#5fd4a6";
const INSTALL_URL = "https://github.com/apps/prlens-dev-jivesh";
const REPO_URL = "https://github.com/Coder909-byte/prlens";

export default function LandingPage() {
  return (
    <div style={{ background: "#0e1115", color: "#e6e9ee", fontFamily: SANS, display: "flex", flexDirection: "column" }}>
      <Nav />
      <Hero />
      <HowItWorks />
      <RealReview />
      <Benchmark />
      <Limitations />
      <Footer />
    </div>
  );
}

function Nav() {
  return (
    <nav
      style={{
        height: 72,
        boxSizing: "border-box",
        padding: "0 clamp(20px, 5vw, 160px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        borderBottom: "1px solid #1a1e24",
      }}
    >
      <a href="#top" style={{ display: "flex", alignItems: "center", gap: 10, color: "#eef1f4", fontFamily: MONO, fontSize: 15, fontWeight: 500 }}>
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
          <circle cx="7.5" cy="7.5" r="5.5" stroke={ACCENT} strokeWidth="1.6" />
          <path d="M11.5 11.5L16 16" stroke={ACCENT} strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        <span>prlens</span>
      </a>
      <div className="hide-below-640" style={{ display: "flex", alignItems: "center", gap: 32, fontSize: 14 }}>
        <a href="#how" style={{ color: "#a4acb7" }}>How it works</a>
        <a href="#benchmark" style={{ color: "#a4acb7" }}>Benchmark</a>
        <a href="#limitations" style={{ color: "#a4acb7" }}>Limitations</a>
        <a href={REPO_URL} style={{ color: "#a4acb7" }}>GitHub</a>
      </div>
    </nav>
  );
}

function Hero() {
  return (
    <section id="top" className="stack-below-900" style={{ padding: "clamp(56px, 8vw, 112px) clamp(20px, 5vw, 160px) 120px", display: "flex", gap: 72, alignItems: "center" }}>
      <div style={{ width: 610, maxWidth: "100%", flexShrink: 0, display: "flex", flexDirection: "column", gap: 28 }}>
        <div style={{ fontFamily: MONO, fontSize: 13, color: "#8a939f", letterSpacing: "0.02em" }}>GitHub App · pull-request review</div>
        <h1 style={{ margin: 0, fontSize: "clamp(38px, 5vw, 54px)", lineHeight: 1.08, fontWeight: 500, letterSpacing: "-0.025em", color: "#f3f5f7" }}>
          Code review that reads the repository, not just the diff.
        </h1>
        <p style={{ margin: 0, fontSize: 18, lineHeight: 1.6, color: "#a4acb7", maxWidth: 560 }}>
          When a pull request opens, PRLens indexes the repo, retrieves the functions the change calls and the code that calls it, and posts inline findings with a severity, an explanation and a suggested fix.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 20, paddingTop: 8 }}>
          <a
            href={INSTALL_URL}
            style={{ display: "inline-flex", alignItems: "center", gap: 10, height: 46, padding: "0 20px", borderRadius: 8, background: ACCENT, color: "#062117", fontSize: 15, fontWeight: 600 }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M8 2v12M2 8h12" stroke="#062117" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            <span>Install on GitHub</span>
          </a>
          <a href="#benchmark" style={{ display: "inline-flex", alignItems: "center", gap: 8, height: 46, padding: "0 18px", borderRadius: 8, border: "1px solid #262c35", color: "#d5dae1", fontSize: 15, fontWeight: 500 }}>
            <span>Benchmark results</span>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M3 7h8M8 4l3 3-3 3" stroke="#a4acb7" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
        </div>
        <div style={{ fontFamily: MONO, fontSize: 12.5, color: "#7d8692" }}>n = 11 · repo-aware vs diff-only not distinguishable at this size · limitations stated below</div>
      </div>

      <div className="hero-side" style={{ flexGrow: 1, width: "100%", border: "1px solid #222831", borderRadius: 12, background: "#13171c", overflow: "hidden" }}>
        <div style={{ padding: "14px 18px", background: "#161a20", borderBottom: "1px solid #1f242b", display: "flex", justifyContent: "space-between", alignItems: "center", fontFamily: MONO, fontSize: 12.5 }}>
          <span style={{ color: "#c3c9d1" }}>retrieval · 1 hunk</span>
          <span style={{ color: ACCENT, background: "rgba(95, 212, 166, 0.1)", padding: "2px 7px", borderRadius: 4, fontSize: 11 }}>repo-aware</span>
        </div>
        <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 14, fontFamily: MONO, fontSize: 12.5, lineHeight: 1.5 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ color: "#7d8692" }}>hunk</span>
            <span style={{ color: "#e6e9ee" }}>get-poetry.py:352–358</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ color: "#7d8692" }}>changed symbol</span>
            <span style={{ color: "#e6e9ee" }}>
              run() <span style={{ color: "#7d8692" }}>method</span>
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingTop: 4, borderTop: "1px dashed #2b313a" }}>
            <span style={{ color: "#7d8692", paddingTop: 10 }}>retrieved</span>
            <div style={{ display: "grid", gridTemplateColumns: "96px minmax(0, 1fr)", rowGap: 6, columnGap: 12 }}>
              <span style={{ color: "#8a939f" }}>callee-def</span>
              <span style={{ color: "#d5dae1" }}>get_version <span style={{ color: "#7d8692" }}>:384–476</span></span>
              <span style={{ color: "#8a939f" }}>callee-def</span>
              <span style={{ color: "#d5dae1" }}>customize_install <span style={{ color: "#7d8692" }}>:478–487</span></span>
              <span style={{ color: "#8a939f" }}>callee-def</span>
              <span style={{ color: "#d5dae1" }}>install <span style={{ color: "#7d8692" }}>:519–533</span></span>
              <span style={{ color: "#8a939f" }}>callee-def</span>
              <span style={{ color: "#d5dae1" }}>display_pre_message <span style={{ color: "#7d8692" }}>:914–941</span></span>
              <span style={{ color: "#8a939f" }}>…</span>
              <span style={{ color: "#8a939f" }}>+7 more, 4 from install-poetry.py</span>
            </div>
          </div>
        </div>
        <div style={{ padding: "12px 18px", borderTop: "1px solid #1a1e24", background: "#111418", fontFamily: MONO, fontSize: 12, color: "#8a939f", display: "flex", gap: 18 }}>
          <span>11 items</span>
          <span>2,931 input tokens</span>
          <span>14.7 s</span>
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  return (
    <section id="how" style={{ padding: "104px clamp(20px, 5vw, 160px) 0", borderTop: "1px solid #1a1e24", display: "flex", flexDirection: "column", gap: 48 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ fontFamily: MONO, fontSize: 12.5, color: "#7d8692" }}>01 · how it works</div>
        <h2 style={{ margin: 0, fontSize: 34, fontWeight: 500, letterSpacing: "-0.02em", color: "#eef1f4" }}>Three steps, one webhook.</h2>
      </div>
      <div className="stack-below-900" style={{ display: "flex", alignItems: "stretch", gap: 16 }}>
        <StepCard
          n={1}
          title="A pull request opens"
          body="GitHub sends the event; PRLens fetches the diff."
          panel={
            <>
              <span style={{ color: "#7d8692" }}>event</span>
              <span style={{ color: "#d5dae1" }}>
                pull_request.<span style={{ color: ACCENT }}>opened</span>
              </span>
              <span style={{ color: "#8a939f" }}>python-poetry/poetry#3927</span>
            </>
          }
        />
        <StepArrow />
        <StepCard
          n={2}
          title="Index and retrieve"
          body="Each hunk maps to the symbol it changes; related code comes along."
          panel={
            <>
              <span style={{ color: "#d5dae1" }}>hunk → run()</span>
              <span style={{ color: "#8a939f" }}>├─ callers</span>
              <span style={{ color: "#8a939f" }}>├─ callee definitions</span>
              <span style={{ color: ACCENT }}>└─ 11 items in context</span>
            </>
          }
        />
        <StepArrow />
        <StepCard
          n={3}
          title="Inline findings"
          body="Posted on the exact line, with a fix you can apply or ignore."
          panel={
            <>
              <div style={{ fontFamily: MONO, fontSize: 12, color: "#7d8692" }}>get-poetry.py · line 356</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <SeverityBadge>medium</SeverityBadge>
                <span style={{ fontSize: 13, color: "#d5dae1" }}>Non-zero exit for a no-op</span>
              </div>
              <div style={{ height: 6, width: "78%", borderRadius: 3, background: "#1a1e24" }} />
            </>
          }
          panelJustify="center"
        />
      </div>
    </section>
  );
}

function StepCard({ n, title, body, panel, panelJustify }: { n: number; title: string; body: string; panel: React.ReactNode; panelJustify?: "center" }) {
  return (
    <div style={{ flex: "1 1 0", border: "1px solid #222831", borderRadius: 12, background: "#13171c", padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ fontFamily: MONO, fontSize: 12, color: "#7d8692" }}>{n}</div>
      <div
        style={{
          height: 132,
          borderRadius: 8,
          background: "#0f1216",
          border: "1px solid #1a1e24",
          padding: 16,
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          justifyContent: panelJustify ?? "center",
          gap: 10,
          fontFamily: MONO,
          fontSize: 12,
        }}
      >
        {panel}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ fontSize: 17, fontWeight: 500, color: "#eef1f4" }}>{title}</div>
        <div style={{ fontSize: 14.5, lineHeight: 1.5, color: "#a4acb7" }}>{body}</div>
      </div>
    </div>
  );
}

function StepArrow() {
  return (
    <div className="hide-below-640" style={{ display: "flex", alignItems: "center" }}>
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M5 12h14M14 7l5 5-5 5" stroke="#4a525d" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

function SeverityBadge({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontFamily: MONO,
        fontSize: 11,
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: "0.04em",
        color: "#ecd06a",
        background: "rgba(232, 197, 71, 0.1)",
        border: "1px solid rgba(232, 197, 71, 0.32)",
        borderRadius: 4,
        padding: "2px 8px",
      }}
    >
      {children}
    </span>
  );
}

function RealReview() {
  return (
    <section style={{ padding: "128px clamp(20px, 5vw, 160px) 0", display: "flex", flexDirection: "column", gap: 40 }}>
      <div className="stack-below-900" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 40 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ fontFamily: MONO, fontSize: 12.5, color: "#7d8692" }}>02 · a real review</div>
          <h2 style={{ margin: 0, fontSize: 34, fontWeight: 500, letterSpacing: "-0.02em", color: "#eef1f4" }}>A one-character change, caught.</h2>
        </div>
        <p style={{ margin: 0, maxWidth: 440, fontSize: 14.5, lineHeight: 1.55, color: "#8a939f" }}>
          Unedited output from the benchmark run on python-poetry/poetry#3927, which upstream later reverted in #3943. Diff-only mode posted nothing on this PR.
        </p>
      </div>

      <div style={{ border: "1px solid #222831", borderRadius: 12, background: "#13171c", overflow: "hidden" }}>
        <div style={{ padding: "14px 20px", background: "#161a20", borderBottom: "1px solid #1f242b", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8, fontFamily: MONO, fontSize: 13 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ color: "#e6e9ee" }}>get-poetry.py</span>
            <span style={{ color: "#7fdcb5" }}>+1</span>
            <span style={{ color: "#ff8080" }}>−1</span>
          </div>
          <span style={{ color: "#8a939f" }}>python-poetry/poetry · #3927</span>
        </div>

        <div style={{ fontFamily: MONO, fontSize: 13, lineHeight: "24px", background: "#0b0d10", overflowX: "auto" }}>
          <DiffRow cols={["", "", "", "@@ -352,7 +352,7 @@ def run(self):"]} bg="rgba(106, 183, 255, 0.06)" fg="#8a939f" />
          <DiffRow cols={["352", "352", "", "        version, current_version = self.get_version()"]} />
          <DiffRow cols={["353", "353", "", ""]} />
          <DiffRow cols={["354", "354", "", "        if version is None:"]} />
          <DiffRow cols={["355", "", "−", "            return 0"]} bg="rgba(255, 107, 107, 0.08)" fg="#f0c4c4" markColor="#ff8080" lineColor="#7d5a5a" />
          <DiffRow cols={["", "355", "+", "            return 1"]} bg="rgba(95, 212, 166, 0.08)" fg="#c9f0de" markColor="#7fdcb5" lineColor="#4f7a68" />

          <div style={{ padding: "16px 20px 20px clamp(20px, 8vw, 136px)", background: "#0e1115", borderTop: "1px solid #1a1e24", borderBottom: "1px solid #1a1e24" }}>
            <div style={{ border: "1px solid #262c35", borderRadius: 10, background: "#13171c", fontFamily: SANS, overflow: "hidden" }}>
              <div style={{ padding: "12px 16px", display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, borderBottom: "1px solid #1f242b" }}>
                <div style={{ width: 22, height: 22, borderRadius: 5, background: "#0f1216", border: "1px solid #262c35", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="12" height="12" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                    <circle cx="7.5" cy="7.5" r="5.5" stroke={ACCENT} strokeWidth="2" />
                    <path d="M11.5 11.5L16 16" stroke={ACCENT} strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </div>
                <span style={{ fontSize: 14, fontWeight: 600, color: "#eef1f4" }}>prlens</span>
                <span style={{ fontFamily: MONO, fontSize: 11, color: "#8a939f", border: "1px solid #262c35", borderRadius: 4, padding: "1px 6px" }}>bot</span>
                <SeverityBadge>medium</SeverityBadge>
                <span style={{ fontFamily: MONO, fontSize: 12, color: "#8a939f" }}>bug · confidence 0.60</span>
              </div>
              <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 16 }}>
                <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.6, color: "#d5dae1", maxWidth: 860 }}>
                  The run() method now returns 1 when version is None, whereas it previously returned 0. A None version typically means there is nothing to install (e.g., offline mode or already up‑to‑date). Returning a non‑zero exit code signals an error to callers (e.g., sys.exit()), which may cause scripts or CI pipelines to treat a normal no‑action situation as a failure.
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ fontFamily: MONO, fontSize: 11.5, color: "#7d8692", textTransform: "uppercase", letterSpacing: "0.06em" }}>Suggested fix</div>
                  <div style={{ fontSize: 14, lineHeight: 1.55, color: "#c3c9d1", background: "#0f1216", border: "1px solid #1a1e24", borderRadius: 6, padding: "12px 14px" }}>
                    Restore the original return value (0) for the &quot;version is None&quot; case, or update downstream callers to handle the new non‑zero exit code appropriately and document the change.
                  </div>
                </div>
              </div>
              <div style={{ padding: "10px 16px", borderTop: "1px solid #1a1e24", background: "#111418", fontFamily: MONO, fontSize: 12, color: "#8a939f", display: "flex", flexWrap: "wrap", gap: 20 }}>
                <span style={{ color: ACCENT }}>repo-aware</span>
                <span>context: get_version :384–476, customize_install :478–487, +9</span>
                <span>gpt-oss-120b</span>
              </div>
            </div>
          </div>

          <DiffRow cols={["356", "356", "", ""]} />
          <DiffRow cols={["357", "357", "", "        self.customize_install()"]} />
          <DiffRow cols={["358", "358", "", "        self.display_pre_message()"]} paddingBottom={8} />
        </div>
      </div>
    </section>
  );
}

function DiffRow({
  cols,
  bg,
  fg,
  markColor,
  lineColor,
  paddingBottom,
}: {
  cols: [string, string, string, string];
  bg?: string;
  fg?: string;
  markColor?: string;
  lineColor?: string;
  paddingBottom?: number;
}) {
  const [oldLine, newLine, mark, code] = cols;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "56px 56px 24px minmax(0, 1fr)", background: bg, color: fg ?? "#c3c9d1", paddingBottom }}>
      <span style={{ textAlign: "right", paddingRight: 12, color: lineColor ?? "#4a525d" }}>{oldLine}</span>
      <span style={{ textAlign: "right", paddingRight: 12, color: lineColor ?? "#4a525d" }}>{newLine}</span>
      <span style={{ color: markColor }}>{mark}</span>
      <span style={{ whiteSpace: "pre" }}>{code}</span>
    </div>
  );
}

function Benchmark() {
  return (
    <section id="benchmark" style={{ padding: "128px clamp(20px, 5vw, 160px) 0", display: "flex", flexDirection: "column", gap: 40 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ fontFamily: MONO, fontSize: 12.5, color: "#7d8692" }}>03 · benchmark</div>
        <h2 style={{ margin: 0, fontSize: 34, fontWeight: 500, letterSpacing: "-0.02em", color: "#eef1f4" }}>Diff-only vs repo-aware, same model, same PRs.</h2>
        <div style={{ fontFamily: MONO, fontSize: 13, color: "#c3c9d1", display: "flex", flexWrap: "wrap", gap: "8px 22px", paddingTop: 6 }}>
          <span>
            <span style={{ color: ACCENT }}>n = 11</span> bug/fix pairs
          </span>
          <span>6 repositories</span>
          <span>all revert-tier</span>
          <span>gpt-oss-120b via Groq</span>
          <span>5 runs/mode · 2026-09-22</span>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          padding: "16px 20px",
          borderRadius: 10,
          border: `1px solid ${ACCENT}55`,
          background: "rgba(95, 212, 166, 0.06)",
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
          <circle cx="12" cy="12" r="9" stroke={ACCENT} strokeWidth="2" />
          <path d="M12 8v5M12 16.5v.5" stroke={ACCENT} strokeWidth="2" strokeLinecap="round" />
        </svg>
        <span style={{ fontSize: 14.5, lineHeight: 1.5, color: "#d5dae1" }}>
          <strong style={{ color: "#eef1f4" }}>Repo-aware and diff-only are not distinguishable at n = 11.</strong> Repeated 5 times per pair per mode, diff-only&apos;s recall ranges 27.3–36.4%, repo-aware&apos;s ranges 18.2–54.5%. The ranges overlap — the ~5.5-point mean difference is run-to-run model noise, not a measured effect of repo-aware context.
        </span>
      </div>

      <div className="stack-below-900" style={{ display: "flex", gap: 32, alignItems: "flex-start" }}>
        {/* Table */}
        <div style={{ flex: "1 1 0", width: "100%", border: "1px solid #222831", borderRadius: 12, background: "#13171c", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14.5, fontVariantNumeric: "tabular-nums" }}>
            <thead>
              <tr style={{ background: "#161a20" }}>
                <th style={{ textAlign: "left", padding: "14px 20px", fontWeight: 500, color: "#8a939f", fontSize: 13, borderBottom: "1px solid #1f242b" }}>Metric</th>
                <th style={{ textAlign: "right", padding: "14px 20px", borderBottom: "1px solid #1f242b" }}>
                  <span style={{ fontFamily: MONO, fontSize: 11.5, fontWeight: 400, color: "#a9b8cc", background: "rgba(169, 184, 204, 0.09)", padding: "2px 7px", borderRadius: 4 }}>diff-only</span>
                </th>
                <th style={{ textAlign: "right", padding: "14px 20px", borderBottom: "1px solid #1f242b" }}>
                  <span style={{ fontFamily: MONO, fontSize: 11.5, fontWeight: 400, color: ACCENT, background: "rgba(95, 212, 166, 0.1)", padding: "2px 7px", borderRadius: 4 }}>repo-aware</span>
                </th>
              </tr>
            </thead>
            <tbody style={{ fontFamily: MONO, fontSize: 14 }}>
              <BenchRow label="Recall, mean of 5 runs" a="32.7%" aSub="range 27.3–36.4%" b="38.2%" bSub="range 18.2–54.5%" />
              <BenchRow label="False positives per PR" a="0.00" b="0.00" />
              <BenchRow label="Cost per review, avg" a="$0.00051" b="$0.00081" />
              <BenchRow label="Latency, p50" a="2.5 s" b="3.3 s" />
              <BenchRow label="Failed calls (of 55)" a="1" b="6" last />
            </tbody>
          </table>
          <div style={{ padding: "14px 20px", borderTop: "1px solid #1a1e24", background: "#111418", fontSize: 13, lineHeight: 1.5, color: "#8a939f" }}>
            Repo context adds ~1,282 input tokens per review on average. Repo-aware also failed outright (exhausted retries) more often — mostly provider rate-limiting on the larger prompts, not a model-quality issue.
          </div>
        </div>

        {/* Confusion matrix */}
        <div className="matrix-side" style={{ width: 470, flexShrink: 0, border: "1px solid #222831", borderRadius: 12, background: "#13171c", padding: 22, boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ fontSize: 15, fontWeight: 500, color: "#eef1f4" }}>Which mode caught which bug</div>
            <div style={{ fontSize: 13, color: "#8a939f" }}>Rows: diff-only. Columns: repo-aware. 55 pair×run comparisons (11 pairs × 5 runs).</div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "76px minmax(0, 1fr) minmax(0, 1fr)", gap: 8, fontFamily: MONO }}>
            <span />
            <span style={{ fontSize: 11.5, color: ACCENT, textAlign: "center" }}>caught</span>
            <span style={{ fontSize: 11.5, color: ACCENT, textAlign: "center" }}>missed</span>

            <span style={{ fontSize: 11.5, color: "#a9b8cc", alignSelf: "center" }}>caught</span>
            <MatrixCell n={15} label="both" bg="#1a2320" border="#22302a" />
            <MatrixCell n={3} label="diff-only only" bg="#0f1216" border="#a9b8cc" />

            <span style={{ fontSize: 11.5, color: "#a9b8cc", alignSelf: "center" }}>missed</span>
            <MatrixCell n={6} label="repo-aware only" bg="#0f1216" border={ACCENT} />
            <MatrixCell n={31} label="neither" bg="#111418" border="#1a1e24" dim />
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.55, color: "#a4acb7" }}>
            Neither mode catches anything in 31 of 55 comparisons (56%) — most of the sample, most of the time. Repo-aware finds something diff-only doesn&apos;t in 6; diff-only finds something repo-aware doesn&apos;t in 3.
          </div>
        </div>
      </div>
    </section>
  );
}

function BenchRow({ label, a, aSub, b, bSub, last }: { label: string; a: string; aSub?: string; b: string; bSub?: string; last?: boolean }) {
  const borderBottom = last ? undefined : "1px solid #1a1e24";
  return (
    <tr>
      <td style={{ padding: "16px 20px", borderBottom, fontFamily: SANS, color: "#d5dae1" }}>{label}</td>
      <td style={{ padding: "16px 20px", borderBottom, textAlign: "right", color: "#eef1f4" }}>
        {a}
        {aSub && (
          <>
            <br />
            <span style={{ fontSize: 11.5, color: "#7d8692" }}>{aSub}</span>
          </>
        )}
      </td>
      <td style={{ padding: "16px 20px", borderBottom, textAlign: "right", color: "#eef1f4" }}>
        {b}
        {bSub && (
          <>
            <br />
            <span style={{ fontSize: 11.5, color: "#7d8692" }}>{bSub}</span>
          </>
        )}
      </td>
    </tr>
  );
}

function MatrixCell({ n, label, bg, border, dim }: { n: number; label: string; bg: string; border: string; dim?: boolean }) {
  return (
    <div style={{ height: 96, borderRadius: 8, background: bg, border: `1px solid ${border}`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, padding: "0 8px" }}>
      <span style={{ fontSize: 30, color: dim ? "#8a939f" : "#eef1f4" }}>{n}</span>
      <span style={{ fontSize: 11, color: dim ? "#7d8692" : "#8a939f", textAlign: "center" }}>{label}</span>
    </div>
  );
}

function Limitations() {
  const tiles = [
    { k: "n = 11", v: "One pair moves any single run's recall by 9.1 points. Treat every percentage on this page as a count, not a measurement." },
    { k: "revert-tier only", v: "Every pair is a merged PR that upstream later reverted. Clean ground truth, but a narrow slice of real bugs." },
    { k: "5-run replication", v: "A single run of each mode showed a 36%→54% swing in repo-aware recall with zero code changes. Every number above is 5 independent runs per pair per mode, not one — LLM output isn't fully deterministic even at temperature 0." },
    { k: "no held-out split", v: "All 11 pairs are the dev set used while building the prompts. A test split waits on a larger dataset." },
    { k: "0 FPs, 11 PRs", v: "Zero false positives on eleven PRs says little about noise on the PRs you open." },
    { k: "one retraction", v: "An earlier single-run finding — repo-aware missing a bug diff-only caught despite good retrieved context — didn't hold up under replication. Retracted, not restated as a result." },
  ];
  return (
    <section id="limitations" style={{ padding: "128px clamp(20px, 5vw, 160px) 0", display: "flex", flexDirection: "column", gap: 40 }}>
      <div className="stack-below-900" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 40 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ fontFamily: MONO, fontSize: 12.5, color: "#7d8692" }}>04 · limitations</div>
          <h2 style={{ margin: 0, fontSize: 34, fontWeight: 500, letterSpacing: "-0.02em", color: "#eef1f4" }}>What these numbers do not show.</h2>
        </div>
        <p style={{ margin: 0, maxWidth: 440, fontSize: 14.5, lineHeight: 1.55, color: "#8a939f" }}>Stated here rather than in a footnote, because they decide how much the table above is worth.</p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 1, background: "#222831", border: "1px solid #222831", borderRadius: 12, overflow: "hidden" }}>
        {tiles.map((t) => (
          <div key={t.k} style={{ background: "#13171c", padding: "26px 28px", display: "flex", gap: 24 }}>
            <span style={{ width: 150, flexShrink: 0, fontFamily: MONO, fontSize: 14, color: ACCENT }}>{t.k}</span>
            <span style={{ fontSize: 14.5, lineHeight: 1.55, color: "#c3c9d1" }}>{t.v}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer style={{ marginTop: 136, padding: "36px clamp(20px, 5vw, 160px) 48px", borderTop: "1px solid #1a1e24", display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 16, fontSize: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, fontFamily: MONO, color: "#8a939f" }}>
        <svg width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden="true">
          <circle cx="7.5" cy="7.5" r="5.5" stroke="#6b737e" strokeWidth="1.6" />
          <path d="M11.5 11.5L16 16" stroke="#6b737e" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        <span>prlens</span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 28 }}>
        <a href={REPO_URL} style={{ color: "#a4acb7" }}>GitHub repository</a>
        <a href={`${REPO_URL}/tree/main/evals`} style={{ color: "#a4acb7" }}>Methodology</a>
        <a href={`${REPO_URL}/tree/main/evals/reports`} style={{ color: "#a4acb7" }}>Raw results</a>
      </div>
    </footer>
  );
}
