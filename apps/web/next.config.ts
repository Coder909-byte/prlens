import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // /benchmark reads evals/reports/*.json off disk (see benchmark-report.ts)
  // - two directories above this app, outside Next's own tracing root by
  // default. Next's automatic file tracer already picks this up today
  // because the directory path is built from string literals (readdirSync
  // over a statically-resolvable path), but that's an implicit heuristic,
  // not a guarantee - this makes it an explicit one, so it can't silently
  // stop working if that code changes shape later.
  outputFileTracingIncludes: {
    "/benchmark": ["../../evals/reports/**/*"],
  },
};

export default nextConfig;
