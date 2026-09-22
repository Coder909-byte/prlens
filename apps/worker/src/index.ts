import { createPgBoss, ensureReviewQueue, logger } from "@prlens/shared";
import { registerReviewWorker } from "./lib.js";

/** Local-dev standalone entrypoint - production runs this logic inside apps/server's combined process instead (see apps/server/src/index.ts), sharing registerReviewWorker rather than duplicating it. */
async function main(): Promise<void> {
  const boss = createPgBoss();
  boss.on("error", (err) => logger.error({ err }, "pg-boss error"));

  await boss.start();
  await ensureReviewQueue(boss);
  await registerReviewWorker(boss);

  logger.info("worker listening for review jobs");
}

main().catch((err: unknown) => {
  logger.error({ err }, "worker failed to start");
  process.exit(1);
});
