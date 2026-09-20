# Eval report — repo-aware

Generated: 2026-09-20T05:52:26.120Z
Provider: groq · Prompt: repo-aware.v1.md

> **Note on dataset size**: Dataset too small (11 accepted pairs) to hold out a test split - all accepted pairs are assigned to "dev" and used as the single evaluation set. No "test" split exists yet; --split test in the runner is reserved for when the dataset grows.

## Overall

| Split | Pairs | Recall | FP/PR | Avg cost | p50 latency | p95 latency | Failed |
|---|---|---|---|---|---|---|---|
| all | 11 | 36.4% | 0.00 | $0.00079 | 11440ms | 38938ms | 0 |

Total cost: $0.00871

## Per-repo breakdown

| Repo | Pairs | Recall | FP/PR | Avg cost | p50 latency | p95 latency | Failed |
|---|---|---|---|---|---|---|---|
| axios/axios | 4 | 50.0% | 0.00 | $0.00073 | 4981ms | 6192ms | 0 |
| date-fns/date-fns | 1 | 0.0% | 0.00 | $0.00020 | 11440ms | 11440ms | 0 |
| encode/httpx | 1 | 0.0% | 0.00 | $0.00087 | 9099ms | 9099ms | 0 |
| psf/requests | 1 | 0.0% | 0.00 | $0.00131 | 38938ms | 38938ms | 0 |
| python-poetry/poetry | 1 | 100.0% | 0.00 | $0.00091 | 27158ms | 27158ms | 0 |
| sveltejs/svelte | 3 | 33.3% | 0.00 | $0.00083 | 20264ms | 36701ms | 0 |

## Per-pair results

| Pair | Caught | FPs | Cost | Latency |
|---|---|---|---|---|
| axios/axios#2977:revert:1258 | ✗ | 0 | $0.00080 | 4990ms |
| axios/axios#2982:revert:1511 | ✓ | 0 | $0.00081 | 6192ms |
| axios/axios#3289:revert:1773 | ✗ | 0 | $0.00047 | 4981ms |
| axios/axios#4699:revert:4550 | ✓ | 0 | $0.00085 | 3225ms |
| date-fns/date-fns#1256:revert:1233 | ✗ | 0 | $0.00020 | 11440ms |
| encode/httpx#2539:revert:2523 | ✗ | 0 | $0.00087 | 9099ms |
| psf/requests#3738:revert:3713 | ✗ | 0 | $0.00131 | 38938ms |
| python-poetry/poetry#3943:revert:3927 | ✓ | 0 | $0.00091 | 27158ms |
| sveltejs/svelte#11568:revert:11562 | ✗ | 0 | $0.00040 | 13988ms |
| sveltejs/svelte#12931:revert:12921 | ✗ | 0 | $0.00093 | 20264ms |
| sveltejs/svelte#13131:revert:13082 | ✓ | 0 | $0.00117 | 36701ms |
