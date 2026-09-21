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

Both modes run against the same 11 accepted pairs, groq/`openai/gpt-oss-120b`, no fallback provider, single prompt version each.

| Mode | Recall | FP/PR | Avg cost/review | p50 latency | p95 latency |
|---|---|---|---|---|---|
| diff-only | 36.4% (4/11) | 0.00 | $0.00052 | 2,677ms | 16,592ms |
| repo-aware | 36.4% (4/11) | 0.00 | $0.00079 | 11,440ms | 38,938ms |

Repo-aware context costs about **1,416 extra input tokens per review** (+$0.00296 total across 11 pairs) and roughly 4x the latency, for the *same* aggregate recall on this sample — but not the same bugs.

### The finding worth reporting: retrieval worked, the model didn't act on it

Both modes caught 4 of 11 pairs, but not the *same* 4 — 2 pairs diverged, and the retrieved context was logged per hunk specifically to distinguish why:

- **`psf/requests#3738`** (introducing PR #3713, "Restrict URL preparation to HTTP/HTTPS," ground truth `requests/models.py:350-352`): diff-only caught it — a real finding at line 352, confidence 0.94, correctly identifying that the new scheme check breaks on non-HTTP(S) URLs. Repo-aware **missed it**. Checking the logged context directly: retrieval surfaced 18 relevant items across the 2 changed hunks — the exact callees, callers, and even the relevant test file. The model was given the right context and returned zero findings anyway.
- **`python-poetry/poetry#3943`**: the reverse — diff-only found nothing, repo-aware caught it, with 11 retrieved items that plausibly supplied the missing signal.

On this sample, when repo-aware underperforms, the bottleneck is the model's judgment given more context, not the indexer or retrieval failing to find the right code. That's a specific, falsifiable claim about *this* small model on *this* small sample, not a general conclusion about repo-aware review.

## Limitations

**n=11.** This is the first fact about every number above. A single pair swings a repo's reported recall between 0% and 100% (see the per-repo breakdown in `evals/reports/2026-09-20-comparison-dev.md`) — repo-level numbers are not yet meaningful on their own.

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
