import { serve } from "@hono/node-server";
import { config, logger } from "@prlens/shared";
import { app, boss, startQueue } from "@prlens/github-app";
import { registerReviewWorker } from "@prlens/worker";

/**
 * Combined production entrypoint: the webhook receiver (apps/github-app)
 * and the review-job worker (apps/worker) in one process, sharing one
 * pg-boss instance. Exists only because Render's free tier gives exactly
 * one web service - there's no free slot for a second, always-on process.
 * Local dev is unaffected: apps/github-app and apps/worker keep running as
 * their own separate `pnpm dev` processes, each still fully usable on its
 * own (this file only imports their lib.ts entrypoints, never the reverse).
 */
async function main(): Promise<void> {
  await startQueue();
  await registerReviewWorker(boss);

  serve({ fetch: app.fetch, port: config.PORT }, (info) => {
    logger.info({ port: info.port }, "combined server (webhook + worker) listening");
  });
}

main().catch((err: unknown) => {
  logger.error({ err }, "combined server failed to start");
  process.exit(1);
});
