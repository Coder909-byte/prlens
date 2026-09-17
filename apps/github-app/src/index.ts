import { serve } from "@hono/node-server";
import { config, logger } from "@prlens/shared";
import { app } from "./app.js";
import { startSmeeClient } from "./smee.js";

if (config.WEBHOOK_PROXY_URL) {
  startSmeeClient(config.WEBHOOK_PROXY_URL, config.PORT);
  logger.info({ target: `http://localhost:${config.PORT}/webhooks/github` }, "smee tunnel started");
}

serve({ fetch: app.fetch, port: config.PORT }, (info) => {
  logger.info({ port: info.port }, "github-app listening");
});
