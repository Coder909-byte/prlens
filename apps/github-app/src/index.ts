import { serve } from "@hono/node-server";
import { config, logger } from "@prlens/shared";
import { app } from "./app.js";
import { startSmeeClient } from "./smee.js";
import { startQueue } from "./queue.js";

async function main(): Promise<void> {
  // Fail fast and loud if pg-boss can't reach Postgres, rather than
  // discovering it on the first webhook delivery.
  await startQueue();

  if (config.WEBHOOK_PROXY_URL) {
    startSmeeClient(config.WEBHOOK_PROXY_URL, config.PORT);
    logger.info({ target: `http://localhost:${config.PORT}/webhooks/github` }, "smee tunnel started");
  }

  serve({ fetch: app.fetch, port: config.PORT }, (info) => {
    logger.info({ port: info.port }, "github-app listening");
  });
}

main().catch((err: unknown) => {
  logger.error({ err }, "github-app failed to start");
  process.exit(1);
});
