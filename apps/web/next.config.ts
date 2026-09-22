import type { NextConfig } from "next";
// No published types (plain CJS, `module.exports = { PrismaPlugin }`) -
// require() rather than import, matching the package's own documented usage.
const { PrismaPlugin } = require("@prisma/nextjs-monorepo-workaround-plugin");

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
  // @prisma/client lives in packages/db, a separate workspace package from
  // this app - webpack's default bundling doesn't copy the generated
  // client's schema.prisma + query engine binary next to the output it
  // produces for each route, so PrismaClientInitializationError ("could not
  // locate the Query Engine") only shows up at runtime in production, not
  // during a successful build. This plugin copies those files into the
  // webpack output AND updates each route's .nft.json trace to include them,
  // so Vercel's deploy actually bundles the engine binary it needs at runtime.
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.plugins = [...config.plugins, new PrismaPlugin()];
    }
    return config;
  },
};

export default nextConfig;
