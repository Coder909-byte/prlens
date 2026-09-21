import { isAbsolute, resolve } from "node:path";
import { z } from "zod";
import { findRepoRoot } from "./paths.js";

export const LLM_PROVIDERS = ["google", "groq", "anthropic"] as const;
export type LlmProvider = (typeof LLM_PROVIDERS)[number];

// dotenv parses `FOO=` (blank) as the empty string, not undefined - and
// `"" ?? default` doesn't fall back to the default since "" isn't nullish.
// Every "leave blank to use the default / not set" field below needs this,
// or a blank value silently becomes a real (wrong) empty-string value - see
// the LLM_MODEL incident this was added for.
const optionalString = () => z.preprocess((v) => (v === "" ? undefined : v), z.string().optional());

// z.coerce.boolean() is a footgun for env vars: it uses JS's Boolean(), so
// the *string* "false" coerces to true (any non-empty string does). This
// parses the intended true/false/1/0/yes/no text instead.
const booleanFlag = (defaultValue: boolean) =>
  z.preprocess((v) => {
    if (v === undefined || v === "") return defaultValue;
    if (typeof v === "string") return ["true", "1", "yes"].includes(v.trim().toLowerCase());
    return v;
  }, z.boolean());

const EnvSchema = z
  .object({
    GITHUB_APP_ID: z.string().min(1, "GITHUB_APP_ID is required"),
    GITHUB_PRIVATE_KEY_PATH: optionalString(),
    GITHUB_PRIVATE_KEY: optionalString(),
    GITHUB_WEBHOOK_SECRET: z.string().min(1, "GITHUB_WEBHOOK_SECRET is required"),
    WEBHOOK_PROXY_URL: optionalString(),

    // LLM provider selection (Vercel AI SDK). Only the API key for the
    // primary provider and any listed fallback providers needs to be set -
    // see the .refine() below.
    LLM_PROVIDER: z.enum(LLM_PROVIDERS).default("google"),
    LLM_MODEL: optionalString(),
    // Retries PER PROVIDER before giving up on it and falling over to the
    // next one (or failing the job if none remain). Default 1 = 2 attempts
    // total. Keep this small - a 503 (model overloaded) or 429 (rate/quota
    // exhausted) won't be fixed by burning the total time budget on one
    // provider's backoff schedule; failing over quickly is the point.
    LLM_MAX_RETRIES: z.coerce.number().int().nonnegative().default(1),
    // Hard wall-clock cap, in seconds, on one review call across every
    // attempt and every fallback provider combined. Once hit, the in-flight
    // request is aborted and the job fails outright (no more providers are
    // tried) - this bounds worst-case job latency regardless of how many
    // fallback providers are configured or how slow their backoff is.
    LLM_REVIEW_TIMEOUT_SECONDS: z.coerce.number().int().positive().default(90),
    // Comma-separated, tried in order when the primary provider exhausts its
    // own retries (LLM_MAX_RETRIES) with a retryable error (429/503/timeout).
    // Each fallback uses its own default model - LLM_MODEL only applies to
    // LLM_PROVIDER.
    LLM_FALLBACK_PROVIDERS: z.preprocess((v) => {
      if (v === undefined || v === "") return [];
      return String(v)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }, z.array(z.enum(LLM_PROVIDERS))),
    GOOGLE_GENERATIVE_AI_API_KEY: optionalString(),
    GROQ_API_KEY: optionalString(),
    ANTHROPIC_API_KEY: optionalString(),

    VOYAGE_API_KEY: optionalString(),

    DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
    DIRECT_URL: z.string().min(1, "DIRECT_URL is required"),

    PORT: z.coerce.number().int().positive().default(3000),
    MAX_DIFF_BYTES: z.coerce.number().int().positive().default(60_000),
    // missing_test findings are noisy in diff-only mode (no repo-wide test
    // visibility to confirm coverage actually exists) - off by default.
    REPORT_MISSING_TESTS: booleanFlag(false),
    // Off by default: repo-aware mode clones/indexes the repo and costs more
    // per review than diff-only. Flip on once the indexer's runtime deps
    // (git, tree-sitter native bindings) are confirmed on the worker's host.
    ENABLE_REPO_AWARE: booleanFlag(false),
  })
  .refine((env) => Boolean(env.GITHUB_PRIVATE_KEY_PATH || env.GITHUB_PRIVATE_KEY), {
    message: "One of GITHUB_PRIVATE_KEY_PATH or GITHUB_PRIVATE_KEY must be set",
    path: ["GITHUB_PRIVATE_KEY_PATH"],
  })
  .refine(
    (env) => missingApiKeyProviders(env).length === 0,
    (env) => ({
      message: `Missing API key env var for LLM provider(s): ${missingApiKeyProviders(env).join(", ")}`,
      path: ["LLM_FALLBACK_PROVIDERS"],
    }),
  );

function apiKeyFor(
  env: { GOOGLE_GENERATIVE_AI_API_KEY?: string; GROQ_API_KEY?: string; ANTHROPIC_API_KEY?: string },
  provider: LlmProvider,
): string | undefined {
  if (provider === "google") return env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (provider === "groq") return env.GROQ_API_KEY;
  return env.ANTHROPIC_API_KEY;
}

function missingApiKeyProviders(env: {
  LLM_PROVIDER: LlmProvider;
  LLM_FALLBACK_PROVIDERS: LlmProvider[];
  GOOGLE_GENERATIVE_AI_API_KEY?: string;
  GROQ_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
}): LlmProvider[] {
  const providers = [env.LLM_PROVIDER, ...env.LLM_FALLBACK_PROVIDERS];
  return providers.filter((p) => !apiKeyFor(env, p));
}

export type Env = z.infer<typeof EnvSchema>;

function loadConfig(): Env {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  const env = parsed.data;

  // Resolve a relative GITHUB_PRIVATE_KEY_PATH against the repo root, not
  // process.cwd() - turbo/pnpm run each app's dev script from that app's own
  // directory (e.g. apps/worker), not the repo root .env lives in.
  if (env.GITHUB_PRIVATE_KEY_PATH && !isAbsolute(env.GITHUB_PRIVATE_KEY_PATH)) {
    env.GITHUB_PRIVATE_KEY_PATH = resolve(findRepoRoot(), env.GITHUB_PRIVATE_KEY_PATH);
  }

  return env;
}

export const config = loadConfig();
