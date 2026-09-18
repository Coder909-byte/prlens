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

const EnvSchema = z
  .object({
    GITHUB_APP_ID: z.string().min(1, "GITHUB_APP_ID is required"),
    GITHUB_PRIVATE_KEY_PATH: optionalString(),
    GITHUB_PRIVATE_KEY: optionalString(),
    GITHUB_WEBHOOK_SECRET: z.string().min(1, "GITHUB_WEBHOOK_SECRET is required"),
    WEBHOOK_PROXY_URL: optionalString(),

    // LLM provider selection (Vercel AI SDK). Only the API key for the
    // selected provider needs to be set - see the .refine() below.
    LLM_PROVIDER: z.enum(LLM_PROVIDERS).default("google"),
    LLM_MODEL: optionalString(),
    LLM_MAX_RETRIES: z.coerce.number().int().nonnegative().default(5),
    GOOGLE_GENERATIVE_AI_API_KEY: optionalString(),
    GROQ_API_KEY: optionalString(),
    ANTHROPIC_API_KEY: optionalString(),

    VOYAGE_API_KEY: optionalString(),

    DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
    DIRECT_URL: z.string().min(1, "DIRECT_URL is required"),

    PORT: z.coerce.number().int().positive().default(3000),
    MAX_DIFF_BYTES: z.coerce.number().int().positive().default(60_000),
  })
  .refine((env) => Boolean(env.GITHUB_PRIVATE_KEY_PATH || env.GITHUB_PRIVATE_KEY), {
    message: "One of GITHUB_PRIVATE_KEY_PATH or GITHUB_PRIVATE_KEY must be set",
    path: ["GITHUB_PRIVATE_KEY_PATH"],
  })
  .refine(
    (env) => {
      if (env.LLM_PROVIDER === "google") return Boolean(env.GOOGLE_GENERATIVE_AI_API_KEY);
      if (env.LLM_PROVIDER === "groq") return Boolean(env.GROQ_API_KEY);
      if (env.LLM_PROVIDER === "anthropic") return Boolean(env.ANTHROPIC_API_KEY);
      return true;
    },
    (env) => ({
      message: `LLM_PROVIDER is "${env.LLM_PROVIDER}" but its API key env var is not set`,
      path: ["LLM_PROVIDER"],
    }),
  );

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
