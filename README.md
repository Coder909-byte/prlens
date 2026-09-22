# PRLens

A GitHub App that reviews pull requests using context from the whole repository — callers, callees, related tests — not just the diff. Built to test one specific, falsifiable claim:

> Repo-aware review catches more real bugs than diff-only review, at low cost and false-alarm rate.

This document reports what's actually been measured so far, on a small benchmark, honestly. It is not a claim that PRLens is ready for production use, and it has no installs or users — this is pre-launch benchmarking work.

## What it does

On `pull_request.opened`/`synchronize`, a webhook receiver (`apps/github-app`) verifies the GitHub signature and enqueues a job on Postgres-backed `pg-boss` (no Redis). A worker (`apps/worker`) picks up the job and runs one of two review pipelines:

- **diff-only**: sends the PR's diff to an LLM (Google Gemini, Groq, or Anthropic, swappable at runtime) with a fixed prompt, gets back structured findings (`{file, line, severity, category, explanation, suggested_fix, confidence}`), posts them as a GitHub review with inline comments.
- **repo-aware**: additionally indexes the repo at the PR's base commit with tree-sitter (JS/TS/Python), builds a symbol table and a name-based call graph, and for each changed hunk retrieves the definitions it calls, the callers of the code it changes, and any test files that reference it — capped to a token budget, closest relations first. That retrieved context goes into the prompt as a clearly separated section, distinct from the diff itself.

Both modes share the same finding schema, the same GitHub-posting code, and the same cost/latency instrumentation, so they can be compared on equal footing.

## The benchmark

Comparing the two modes required real, historical bug-introduce/bug-fix pairs with known ground truth — not synthetic bugs, since the whole point is to measure real-world catch rate.

### Mining

A miner (`evals/dataset/`) scans public repos for two structural signals:

- **Revert**: a commit matching git's own `Revert "..."` / `This reverts commit <sha>.` convention. The reverted PR's diff *is* the ground truth directly — no inference needed. Highest confidence by construction.
- **Issue-link**: a merged PR whose title/body says "fixes/closes/resolves #N," with the actual introducing commit found by walking `git log -L` backward from the fix to whatever last touched those lines, then resolving that commit to its own PR.

12 repositories were mined: an initial batch (got, axios, date-fns, requests, flask, fastapi), then a second batch (vite, svelte, trpc, httpx, pydantic, poetry) chosen for more modern PR/issue conventions after the first batch's yield-per-repo turned out to vary widely. Raw yield: **52 candidate pairs**.

### Filtering

52 candidates is not 52 usable pairs. A sequence of filters, each added after manually reviewing what slipped through the previous one, cut that down:

- Ground truth landing only in CI config, package manifests/lockfiles, doc-site templates, or test-only files — dropped (a code reviewer can't be expected to catch a bug in a YAML file, and a test-only change isn't the bug, it's the spec).
- Same introducing-PR-and-fix-PR (a PR reverting its own in-progress work before merging) — dropped.
- A PR whose *title* doesn't carry a bug signal (fix/bug/crash/regression/incorrect) and isn't corroborated by the linked issue's title or a "bug" label — dropped. A title starting with Add/Implement/Support/Introduce is rejected outright, since GitHub's auto-link keywords fire on any linked issue, not just bug reports, and several "fixes #N" PRs turned out to be closing feature requests.
- An introducing "commit" that's actually a whole-file creation, or whose real diff (once fetched the same way the scoring harness fetches it) is implausibly large (>200 lines) — dropped; blaming an entire file's birth, or a bulk multi-hundred-line commit, for one specific bug is not a precise signal.
- Near-duplicate candidates sharing the same introducing commit and fix PR — collapsed.

This left **19 pairs**. From there, each candidate was reviewed by hand in an interactive tool built for this purpose (diff side-by-side, tier/confidence shown, keyboard-driven accept/reject/uncertain) — **I verified every label myself**; the filters above narrow the pool, they don't replace human judgment. **11 pairs were accepted.**

**52 → 19 (automated filters) → 11 (manual verification).** All 11 currently accepted pairs happen to be revert-tier — see Limitations.

### A negative result: SWE-bench was evaluated and rejected

Before continuing to hand-mine more repos, existing verified bug-fix datasets (SWE-bench, BugsInPy) were considered as a shortcut, since they're execution-verified (failing test before the fix, passing after) rather than heuristically identified. The catch: those datasets give you a confirmed bug + fix, not the PR that *introduced* the bug — which is what this benchmark actually needs, since it measures whether review at introduction time would have caught it. Reusing them would still require the same `git log -L` blame-trace this project already built.

That blame-trace was tested against 20 real SWE-bench Verified instances (5 each from django, sympy, astropy, pytest — deliberately the largest, longest-lived repos in the set, not the easy cases). Result: **2 of 49 traceable ground-truth ranges (4.1%) resolved to a usable single introducing commit.** The dominant failure (42 of 49, 86%) was line-number drift: `git log -L` correctly finds the commit that last touched a line range as numbered in the fix's base commit, but if the bug is *years* old (common in SWE-bench, which selects for "currently has a failing test," not "recently introduced"), enough intervening edits have shifted line numbers that the introducing commit's own diff no longer overlaps the same coordinates. This is a real limitation of line-based blame-tracing over long time horizons, not a bug in the implementation — verified against the actual `deriveGroundTruth`/`resolveOwningPr` code the pipeline runs, not a simplified proxy. SWE-bench was dropped; the 11-pair hand-verified set is what's reported below.

## Results (n=11 — read every number with that in mind)

A single run of each mode showed a large recall swing between two otherwise-identical comparisons (repo-aware moved from 36.4% to 54.5% with *zero* code changes, just a re-run) — traced to LLM output non-determinism, not a real effect. `temperature: 0` is now pinned on every review call, and the swing still happens: some providers just aren't fully deterministic even at temperature 0. A single run per mode cannot support a diff-only vs. repo-aware comparison at n=11, so this reports **5 independent runs per pair per mode** (110 calls total, groq/`openai/gpt-oss-120b`, no fallback provider) instead of one.

| Mode | Mean recall | Range (5 runs) | FP/PR | Avg cost/review | Failed calls |
|---|---|---|---|---|---|
| diff-only | 32.7% | 27.3% – 36.4% | 0.00 | $0.00051 | 1/55 |
| repo-aware | 38.2% | 18.2% – 54.5% | 0.00 | $0.00081 | 6/55 |

**The ranges overlap.** At n=11, diff-only and repo-aware are not distinguishable on this sample — the ~5.5-point mean difference is within run-to-run model noise, not a measured effect of repo-aware context. Repo-aware's range is also visibly wider (18.2–54.5%, more than 2x diff-only's 27.3–36.4% spread), which is itself informative: the extra context doesn't just fail to move the mean, it makes the model's output less consistent run to run.

Repo-aware also failed outright more often — 6 of 55 calls gave up after exhausting retries, vs. 1 of 55 for diff-only, mostly groq rate-limiting on the larger repo-aware prompts (~1,282 extra input tokens/review on average, +$0.0123 total across all 55 repo-aware calls). On this sample, repo-aware's real-world reliability is currently worse, not just its recall being a wash.

### Per-pair catch rate (out of 5 runs)

| Pair | diff-only | repo-aware |
|---|---|---|
| `axios/axios#2982:revert:1511` | 5/5 | 5/5 |
| `sveltejs/svelte#13131:revert:13082` | 5/5 | 4/5 |
| `sveltejs/svelte#11568:revert:11562` | 5/5 | 4/5 |
| `psf/requests#3738:revert:3713` | 3/5 | 3/5 |
| `python-poetry/poetry#3943:revert:3927` | 0/5 | 2/5 |
| `encode/httpx#2539:revert:2523` | 0/5 | 1/5 |
| `axios/axios#2977:revert:1258` | 0/5 | 1/5 |
| `axios/axios#3289:revert:1773` | 0/5 | 1/5 |
| `axios/axios#4699:revert:4550` | 0/5 | 0/5 |
| `date-fns/date-fns#1256:revert:1233` | 0/5 | 0/5 |
| `sveltejs/svelte#12931:revert:12921` | 0/5 | 0/5 |

Only 3 of 11 pairs are caught reliably (≥4/5) by either mode. Everything else is either never caught in 5 tries or caught inconsistently — the same PR, same ground truth, same prompt, a different answer depending on the run.

### Confusion matrix, recomputed from all 55 pair×run comparisons (not 11 pairs)

| | repo-aware ✓ | repo-aware ✗ |
|---|---|---|
| **diff-only ✓** | 15 | 3 |
| **diff-only ✗** | 6 | 31 |

Repo-aware catches something diff-only doesn't in 6 of 55 comparisons; diff-only catches something repo-aware doesn't in 3. Neither mode catches anything in 31 of 55 (56%) — most of the sample, most of the time, both modes miss the bug.

### A claim retracted: "retrieval worked, the model didn't act on it" doesn't hold up

The single-run comparison reported a specific finding: `psf/requests#3738` was caught by diff-only, missed by repo-aware despite retrieval surfacing 18 relevant items — read as "the model seeing the right context and staying quiet." Repeated 5x, repo-aware actually caught this pair 3 of 5 times — the *same* rate as diff-only (3/5). The single run that produced the original claim was one sample from a pair both modes handle inconsistently, not a stable pattern about repo-aware specifically. **Retracted** — kept here as a record of why a single-run finding didn't survive replication, not restated as a result.

## Limitations

**n=11.** This is the first fact about every number above. A single pair swings recall by ~9 points, and the repeated-run ranges above overlap between modes — repo-level numbers, and the diff-only/repo-aware comparison itself, are not yet meaningful on their own.

- **Every accepted pair is revert-tier.** The issue-link identification path (PR-title heuristics, blame-tracing, text-based line remapping) — the majority of the miner's engineering — contributed candidates, but none survived to acceptance. The 11-pair benchmark currently only tests "would repo-aware catch a bug exact enough that its own team reverted it," which is a narrower and probably easier case than the general "fixes #N" bug.
- **No dev/test split.** 11 accepted pairs isn't enough to hold one out meaningfully (a test split infrastructure exists in the runner and is deliberately unused). Any future prompt or retrieval tuning against this same 11 risks overfitting to it, with no held-out check.
- **Single provider/model.** Groq's `openai/gpt-oss-120b`, chosen for cost during development. Zero false positives across every run so far is notable but should be read alongside the fact that this model returns 0 or 1 findings per PR — it's extremely conservative, not necessarily extremely precise at scale. A larger or different model could behave very differently in both directions.
- **Symbol-based retrieval only, no type resolution.** Call-graph edges are matched by name alone. Confirmed in practice: a `.b()` call resolves to every symbol named `b` anywhere in the repo, including, in one indexed file, a Mocha-style test callback parameter named `done` that isn't the function being changed at all. This is a known, accepted tradeoff (no embeddings/vector search per project scope), not an oversight, but it means retrieved context can include false leads as well as real ones.
- **Tree-sitter chunking is heuristic.** Function declarations, class methods, arrow functions assigned to a `const`, and `exports.x = function(){}` patterns are captured; other ways of defining a callable (e.g. object-literal methods, decorators-heavy Python) may not be.
- **The repo index is built at the introducing PR's head SHA, not base.** A symbol (and everything it calls) can be introduced by the same PR under review, in which case it doesn't exist at base SHA at all - indexing at head instead is a strict superset (every pre-existing caller/callee this was designed to find is still present post-PR) and additionally resolves same-PR-introduced symbols correctly. Checked directly against all 11 accepted pairs: this did not change the numbers above - 9/11 ground-truth lines fall on code that already existed at base SHA, and the other 2 zero-context pairs are due to unrelated causes (one ground-truth line isn't covered by any extracted diff hunk; the other is the object-literal-method gap noted above). Will matter more once the dataset grows past revert-tier pairs, where the buggy code itself is more likely to be newly introduced.
- **The SWE-bench trace-rate experiment (4.1%) used 20 instances from 4 repos.** Large enough to identify the line-drift failure mode, not large enough to claim a precise rate for SWE-bench as a whole.

## Repo layout

```
apps/
  github-app/     webhook receiver: verifies signature, enqueues review jobs
  worker/         pulls jobs, runs the review pipeline, posts comments
packages/
  db/             Prisma schema, pgvector setup (unused so far - no embeddings yet)
  indexer/        tree-sitter parsing, symbol/call-graph extraction, context retrieval
  reviewer/       review pipeline: prompts, LLM calls, finding schema, comment formatting
  shared/         config, logging, cost tables
evals/
  dataset/        the miner, mined pairs (committed), hand-verified verdicts, dev/test split
  runner/         the scoring harness: caching, rate limiting, reports
  reports/        generated comparison tables (committed)
```

## Reproducing this

```
pnpm mine --repo <owner>/<name> --pilot 30       # mine one repo
pnpm eval --mode diff-only --split dev --provider groq
pnpm eval --mode repo-aware --split dev --provider groq
pnpm eval:compare --split dev --provider groq     # side-by-side report + per-pair divergence
```

Reports land in `evals/reports/`, LLM outcomes cache per `(repo, PR, sha, mode, provider, model, prompt-content-hash)` so re-running never re-spends a call on an unchanged pair.
