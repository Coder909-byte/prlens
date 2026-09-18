# PRLens (working title) — Repo-aware AI Pull Request Reviewer

## What this is
A GitHub App that reviews pull requests using context from the whole repository
(callers, callees, related tests), not only the diff. It posts inline review comments
on real bugs, security issues and missing tests, and keeps noise low.

## The claim this project must prove (drives every decision)
"Repo-aware review catches more real bugs than diff-only review, at low cost and false-alarm rate."
Every feature must be measurable against the benchmark in `evals/`.
Target resume line: "caught X% of real bugs on a N-PR benchmark at $Y/review; Z installs."

## Stack
- Language: TypeScript everywhere (Node 20+), pnpm workspaces + Turborepo
- GitHub: GitHub App via Octokit (`@octokit/app`, `@octokit/webhooks`)
- Webhook server: Hono (small, fast), deployed on Railway or Fly.io
- Jobs: pg-boss on the existing Neon Postgres (its own `pgboss` schema, connected via
  `DIRECT_URL`) - reviews run longer than a webhook request allows, and this avoids
  running a separate Redis instance
- DB: Postgres + pgvector, Prisma ORM
- Code parsing: tree-sitter (start with TypeScript/JavaScript and Python only)
- Embeddings: Voyage code embedding model
- LLMs: swappable via the Vercel AI SDK (`ai` + `@ai-sdk/google`, `@ai-sdk/groq`, `@ai-sdk/anthropic`).
  Provider/model selected at runtime via `LLM_PROVIDER` / `LLM_MODEL`, default Google Gemini's
  current Flash model. Structured findings come from `generateObject` against the shared Zod
  findings schema — no provider-specific parsing. `LLM_FALLBACK_PROVIDERS` lists providers to
  try in order if the primary exhausts its retries on a 429/503/timeout; both the provider that
  actually served a review and the one originally attempted are recorded on the `Review` row.
- Dashboard + landing page: Next.js (apps/web), UI designed in Claude Design
- Tests: Vitest

## Repo layout
```
apps/
  github-app/     webhook receiver: verifies signature, enqueues review jobs
  worker/         pulls jobs, runs the review pipeline, posts comments
  web/            Next.js landing page + install dashboard (later)
packages/
  db/             Prisma schema, pgvector setup
  indexer/        clone repo, tree-sitter parse, chunk by symbol, embed, build call graph
  reviewer/       review pipeline: context retrieval, prompts, finding filter, comment formatting
  shared/         types, config, logging
evals/
  dataset/        benchmark PRs (JSON): repo, PR number, base SHA, known bug location
  runner/         runs a reviewer mode over the dataset, scores results
  reports/        generated result tables (committed)
```

## Review pipeline (worker)
1. Fetch PR diff and changed files
2. Ensure repo index exists at base SHA (incremental re-index on changed files)
3. For each changed hunk: retrieve context — definitions of called symbols, callers of changed
   symbols, related test files, similar code via embeddings
4. Review call (strong model) returns structured JSON findings:
   `{file, line, severity, category, explanation, suggested_fix, confidence}`
5. Filter pass (cheap model + rules): drop low-confidence, duplicate, style-only findings
6. Post one GitHub review with inline comments; store findings, tokens, cost, latency in DB

Two modes must always exist, selectable by config: `diff-only` (baseline) and `repo-aware`.

## Evaluation (the core of the project)
- Dataset: 200+ real PRs from popular open-source repos where a bug was introduced and later
  fixed by a linked "fix" commit. Record the buggy file + line range as ground truth.
- Metrics per mode: recall (bug caught = finding within ±5 lines of ground truth),
  false positives per PR, cost per review, p50/p95 latency.
- `pnpm eval --mode repo-aware --limit 50` writes a markdown table to `evals/reports/`.
- Never tune prompts on the full set: split into dev (tuning) and test (reporting only).

## Milestones
- M1: App receives `pull_request.opened`, posts a diff-only review on a test repo
- M2: Eval harness + first 50 benchmark PRs, baseline numbers for diff-only
- M3: Indexer + repo-aware mode, numbers compared against baseline
- M4: Filter pass, cost/latency tracking, dashboard
- M5: Marketplace listing, landing page, launch posts, write-up blog post

## Conventions
- Strict TypeScript, no `any`. Zod for all external input (webhooks, LLM JSON output).
- Secrets only via env vars; never log the private key, tokens, or repo source code.
- Every prompt lives in `packages/reviewer/prompts/` as a versioned file; eval reports record
  which prompt version produced them.
- Small commits, one milestone per branch, tests for parsing and scoring logic.
- Before adding a feature, state which metric it should move.

## Local development environment
- macOS 12 (Intel), VS Code, Node 24, pnpm 11
- No Docker: never add docker-compose or container-based dev setup
- Postgres is hosted on Neon (pgvector available); pg-boss (jobs) runs in its own schema
  on the same Neon database - no Redis, no Docker
- Webhooks reach localhost through a smee.io channel
- The developer commits and pushes manually: never run git commit or git push

## Env vars
```
GITHUB_APP_ID=
GITHUB_PRIVATE_KEY_PATH=./private-key.pem   # local; in production use GITHUB_PRIVATE_KEY (PEM contents)
GITHUB_WEBHOOK_SECRET=
WEBHOOK_PROXY_URL=                          # smee.io channel URL (local only)
LLM_PROVIDER=google                         # google | groq | anthropic
LLM_MODEL=                                  # unset = per-provider default (google -> gemini-flash-latest, groq -> openai/gpt-oss-120b)
LLM_MAX_RETRIES=1                           # retries PER PROVIDER before failing over (1 = 2 attempts) - keep small, see packages/reviewer/src/review.ts
LLM_REVIEW_TIMEOUT_SECONDS=90               # hard cap on one review call across all attempts + fallback providers
LLM_FALLBACK_PROVIDERS=                     # comma-separated, tried in order after LLM_PROVIDER exhausts retries
GOOGLE_GENERATIVE_AI_API_KEY=               # required if LLM_PROVIDER=google or google is a fallback
GROQ_API_KEY=                               # required if LLM_PROVIDER=groq or groq is a fallback
ANTHROPIC_API_KEY=                          # required if LLM_PROVIDER=anthropic or anthropic is a fallback
VOYAGE_API_KEY=                             # needed from Milestone 3
DATABASE_URL=                               # Neon pooled connection string
DIRECT_URL=                                 # Neon direct connection string (Prisma migrations + pg-boss)
```