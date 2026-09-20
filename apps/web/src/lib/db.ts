import { PrismaClient } from "@prlens/db";

/**
 * @prlens/db exports a plain `new PrismaClient()` at module scope - fine
 * for a long-running worker process, but Next.js dev's hot-module-reload
 * re-evaluates modules on every edit, and a fresh PrismaClient each time
 * opens a fresh Postgres connection without closing the last one. The
 * standard fix: stash the instance on `globalThis` so HMR reuses it.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
