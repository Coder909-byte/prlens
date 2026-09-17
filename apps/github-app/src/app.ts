import { Hono } from "hono";
import { Webhooks } from "@octokit/webhooks";
import { config, logger } from "@prlens/shared";
import { PullRequestWebhookSchema } from "./schema.js";
import { enqueueReviewJob } from "./queue.js";

const webhooks = new Webhooks({ secret: config.GITHUB_WEBHOOK_SECRET });

const REVIEWABLE_ACTIONS = new Set(["opened", "synchronize"]);

export const app = new Hono();

app.get("/health", (c) => c.text("ok"));

app.post("/webhooks/github", async (c) => {
  const rawBody = await c.req.text();
  const signature = c.req.header("x-hub-signature-256");

  const valid = signature ? await webhooks.verify(rawBody, signature) : false;
  if (!valid) {
    logger.warn("rejected webhook: invalid or missing signature");
    return c.text("invalid signature", 401);
  }

  const eventName = c.req.header("x-github-event");
  if (eventName !== "pull_request") {
    return c.text("ignored: not a pull_request event", 200);
  }

  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return c.text("ignored: invalid JSON", 200);
  }

  const parsed = PullRequestWebhookSchema.safeParse(json);
  if (!parsed.success) {
    logger.warn({ issues: parsed.error.issues }, "ignored webhook: payload did not match expected shape");
    return c.text("ignored: unexpected payload shape", 200);
  }

  const { action, number, pull_request, repository, installation } = parsed.data;

  if (!REVIEWABLE_ACTIONS.has(action)) {
    return c.text(`ignored: action "${action}"`, 200);
  }
  if (pull_request.draft) {
    return c.text("ignored: draft PR", 200);
  }

  await enqueueReviewJob({
    installationId: installation.id,
    owner: repository.owner.login,
    repo: repository.name,
    pullNumber: number,
    headSha: pull_request.head.sha,
    baseSha: pull_request.base.sha,
  });

  return c.text("enqueued", 200);
});
