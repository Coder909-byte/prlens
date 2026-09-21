# Eval report — repo-aware

Generated: 2026-09-21T11:04:48.990Z
Provider: groq · Prompt: repo-aware.v1.md

> **Note on dataset size**: Dataset too small (11 accepted pairs) to hold out a test split - all accepted pairs are assigned to "dev" and used as the single evaluation set. No "test" split exists yet; --split test in the runner is reserved for when the dataset grows.

## Overall

| Split | Pairs | Recall | FP/PR | Avg cost | p50 latency | p95 latency | Failed |
|---|---|---|---|---|---|---|---|
| all | 11 | 54.5% | 0.00 | $0.00095 | 9843ms | 48980ms | 0 |

Total cost: $0.01046

## Per-repo breakdown

| Repo | Pairs | Recall | FP/PR | Avg cost | p50 latency | p95 latency | Failed |
|---|---|---|---|---|---|---|---|
| axios/axios | 4 | 75.0% | 0.00 | $0.00071 | 7854ms | 9843ms | 0 |
| date-fns/date-fns | 1 | 0.0% | 0.00 | $0.00020 | 22105ms | 22105ms | 0 |
| encode/httpx | 1 | 0.0% | 0.00 | $0.00120 | 10525ms | 10525ms | 0 |
| psf/requests | 1 | 100.0% | 0.00 | $0.00166 | 5601ms | 5601ms | 0 |
| python-poetry/poetry | 1 | 100.0% | 0.00 | $0.00100 | 14667ms | 14667ms | 0 |
| sveltejs/svelte | 3 | 33.3% | 0.00 | $0.00119 | 27127ms | 48980ms | 0 |

## Per-pair results

| Pair | Caught | FPs | Cost | Latency |
|---|---|---|---|---|
| axios/axios#2977:revert:1258 | ✓ | 0 | $0.00084 | 8373ms |
| axios/axios#2982:revert:1511 | ✓ | 0 | $0.00070 | 7854ms |
| axios/axios#3289:revert:1773 | ✗ | 0 | $0.00048 | 7559ms |
| axios/axios#4699:revert:4550 | ✓ | 0 | $0.00084 | 9843ms |
| date-fns/date-fns#1256:revert:1233 | ✗ | 0 | $0.00020 | 22105ms |
| encode/httpx#2539:revert:2523 | ✗ | 0 | $0.00120 | 10525ms |
| psf/requests#3738:revert:3713 | ✓ | 0 | $0.00166 | 5601ms |
| python-poetry/poetry#3943:revert:3927 | ✓ | 0 | $0.00100 | 14667ms |
| sveltejs/svelte#11568:revert:11562 | ✗ | 0 | $0.00074 | 27127ms |
| sveltejs/svelte#12931:revert:12921 | ✗ | 0 | $0.00109 | 7550ms |
| sveltejs/svelte#13131:revert:13082 | ✓ | 0 | $0.00172 | 48980ms |
