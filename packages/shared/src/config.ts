import { z } from "zod";

export const LLM_PROVIDERS = ["google", "groq", "anthropic"] as const;
export type LlmProvider = (typeof LLM_PROVIDERS)[number];

const EnvSchema = z
  .object({
    GITHUB_APP_ID: z.string().min(1, "GITHUB_APP_ID is required"),
    GITHUB_PRIVATE_KEY_PATH: z.string().optional(),
    GITHUB_PRIVATE_KEY: z.string().optional(),
    GITHUB_WEBHOOK_SECRET: z.string().min(1, "GITHUB_WEBHOOK_SECRET is required"),
    WEBHOOK_PROXY_URL: z.string().optional(),

    // LLM provider selection (Vercel AI SDK). Only the API key for the
    // selected provider needs to be set - see the .refine() below.
    LLM_PROVIDER: z.enum(LLM_PROVIDERS).default("google"),
    LLM_MODEL: z.string().optional(),
    LLM_MAX_RETRIES: z.coerce.number().int().nonnegative().default(5),
    GOOGLE_GENERATIVE_AI_API_KEY: z.string().optional(),
    GROQ_API_KEY: z.string().optional(),
    ANTHROPIC_API_KEY: z.string().optional(),

    VOYAGE_API_KEY: z.string().optional(),

    DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
    DIRECT_URL: z.string().min(1, "DIRECT_URL is required"),

    REDIS_URL: z.string().min(1, "REDIS_URL is required"),

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
  return parsed.data;
}

export const config = loadConfig();
