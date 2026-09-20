# Eval report — diff-only

Generated: 2026-09-20T05:30:10.731Z
Provider: groq · Prompt: diff-only.v2.md

> **Note on dataset size**: Dataset too small (11 accepted pairs) to hold out a test split - all accepted pairs are assigned to "dev" and used as the single evaluation set. No "test" split exists yet; --split test in the runner is reserved for when the dataset grows.

## Overall

| Split | Pairs | Recall | FP/PR | Avg cost | p50 latency | p95 latency | Failed |
|---|---|---|---|---|---|---|---|
| all | 11 | 36.4% | 0.00 | $0.00052 | 2677ms | 16592ms | 0 |

Total cost: $0.00575

## Per-repo breakdown

| Repo | Pairs | Recall | FP/PR | Avg cost | p50 latency | p95 latency | Failed |
|---|---|---|---|---|---|---|---|
| axios/axios | 4 | 50.0% | 0.00 | $0.00053 | 2514ms | 2837ms | 0 |
| date-fns/date-fns | 1 | 0.0% | 0.00 | $0.00017 | 1124ms | 1124ms | 0 |
| encode/httpx | 1 | 0.0% | 0.00 | $0.00050 | 2064ms | 2064ms | 0 |
| psf/requests | 1 | 100.0% | 0.00 | $0.00084 | 15519ms | 15519ms | 0 |
| python-poetry/poetry | 1 | 0.0% | 0.00 | $0.00023 | 10426ms | 10426ms | 0 |
| sveltejs/svelte | 3 | 33.3% | 0.00 | $0.00062 | 15769ms | 16592ms | 0 |

## Per-pair results

| Pair | Caught | FPs | Cost | Latency |
|---|---|---|---|---|
| axios/axios#2977:revert:1258 | ✗ | 0 | $0.00058 | 2514ms |
| axios/axios#2982:revert:1511 | ✓ | 0 | $0.00068 | 2837ms |
| axios/axios#3289:revert:1773 | ✗ | 0 | $0.00027 | 1151ms |
| axios/axios#4699:revert:4550 | ✓ | 0 | $0.00060 | 2677ms |
| date-fns/date-fns#1256:revert:1233 | ✗ | 0 | $0.00017 | 1124ms |
| encode/httpx#2539:revert:2523 | ✗ | 0 | $0.00050 | 2064ms |
| psf/requests#3738:revert:3713 | ✓ | 0 | $0.00084 | 15519ms |
| python-poetry/poetry#3943:revert:3927 | ✗ | 0 | $0.00023 | 10426ms |
| sveltejs/svelte#11568:revert:11562 | ✗ | 0 | $0.00041 | 2647ms |
| sveltejs/svelte#12931:revert:12921 | ✗ | 0 | $0.00056 | 16592ms |
| sveltejs/svelte#13131:revert:13082 | ✓ | 0 | $0.00089 | 15769ms |
