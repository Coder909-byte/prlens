# Eval comparison — diff-only vs. repo-aware

Generated: 2026-09-21T11:05:00.699Z
Provider: groq · model: default

> **Note on dataset size**: Dataset too small (11 accepted pairs) to hold out a test split - all accepted pairs are assigned to "dev" and used as the single evaluation set. No "test" split exists yet; --split test in the runner is reserved for when the dataset grows.

## Overall

| Mode | Pairs | Recall | FP/PR | Avg cost | Total cost | p50 latency | p95 latency |
|---|---|---|---|---|---|---|---|
| diff-only | 11 | 36.4% | 0.00 | $0.00052 | $0.00575 | 2677ms | 16592ms |
| repo-aware | 11 | 54.5% | 0.00 | $0.00095 | $0.01046 | 9843ms | 48980ms |

**Extra cost from repo context**: ~1599 extra input tokens/review on average, $0.00471 extra total cost across the split.

## Per-repo breakdown

| Repo | Mode | Pairs | Recall | FP/PR | Avg cost |
|---|---|---|---|---|---|
| axios/axios | diff-only | 4 | 50.0% | 0.00 | $0.00053 |
| axios/axios | repo-aware | 4 | 75.0% | 0.00 | $0.00071 |
| date-fns/date-fns | diff-only | 1 | 0.0% | 0.00 | $0.00017 |
| date-fns/date-fns | repo-aware | 1 | 0.0% | 0.00 | $0.00020 |
| encode/httpx | diff-only | 1 | 0.0% | 0.00 | $0.00050 |
| encode/httpx | repo-aware | 1 | 0.0% | 0.00 | $0.00120 |
| psf/requests | diff-only | 1 | 100.0% | 0.00 | $0.00084 |
| psf/requests | repo-aware | 1 | 100.0% | 0.00 | $0.00166 |
| python-poetry/poetry | diff-only | 1 | 0.0% | 0.00 | $0.00023 |
| python-poetry/poetry | repo-aware | 1 | 100.0% | 0.00 | $0.00100 |
| sveltejs/svelte | diff-only | 3 | 33.3% | 0.00 | $0.00062 |
| sveltejs/svelte | repo-aware | 3 | 33.3% | 0.00 | $0.00119 |

## Divergences (where the two modes disagree)

- **axios/axios#2977:revert:1258**: repo-aware caught it, diff-only didn't. Retrieval surfaced 6 relevant item(s) - plausibly what tipped the finding.
- **python-poetry/poetry#3943:revert:3927**: repo-aware caught it, diff-only didn't. Retrieval surfaced 11 relevant item(s) - plausibly what tipped the finding.
