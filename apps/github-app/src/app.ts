import { Hono } from "hono";
import { Webhooks } from "@octokit/webhooks";
import { config, logger } from "@prlens/shared";
import { PullRequestWebhookSchema } from "./schema.js";
import { enqueueReviewJob, type EnqueueResult } from "./queue.js";

const webhooks = new Webhooks({ secret: config.GITHUB_WEBHOOK_SECRET });

const REVIEWABLE_ACTIONS = new Set(["opened", "synchronize"]);

export const app = new Hono();

app.get("/health", (c) => c.text("ok"));

type DeliveryOutcome = EnqueueResult | "skipped-wrong-event" | "skipped-wrong-action" | "skipped-draft" | "error";

/** One line per delivery, whatever branch it took - this is what you grep to answer "what happened to webhook X". */
function logDelivery(fields: Record<string, unknown>, outcome: DeliveryOutcome): void {
  logger.info({ ...fields, outcome }, "webhook delivery");
}

app.post("/webhooks/github", async (c) => {
  const rawBody = await c.req.text();
  const signature = c.req.header("x-hub-signature-256");
  const eventName = c.req.header("x-github-event") ?? "unknown";

  const valid = signature ? await webhooks.verify(rawBody, signature) : false;
  if (!valid) {
    logger.warn({ event: eventName }, "rejected webhook: invalid or missing signature");
    return c.text("invalid signature", 401);
  }

  if (eventName !== "pull_request") {
    // Every webhook creation/update triggers a "ping" delivery before any
    // real event - seeing this once per webhook setup is expected, not a bug.
    logDelivery({ event: eventName }, "skipped-wrong-event");
    return c.text("ignored: not a pull_request event", 200);
  }

  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    logDelivery({ event: eventName }, "error");
    return c.text("ignored: invalid JSON", 200);
  }

  const parsed = PullRequestWebhookSchema.safeParse(json);
  if (!parsed.success) {
    logger.warn({ event: eventName, issues: parsed.error.issues }, "webhook delivery: payload did not match expected shape");
    logDelivery({ event: eventName }, "error");
    return c.text("ignored: unexpected payload shape", 200);
  }

  const { action, number, pull_request, repository, installation } = parsed.data;
  const deliveryFields = {
    event: eventName,
    action,
    owner: repository.owner.login,
    repo: repository.name,
    pr: number,
    headSha: pull_request.head.sha,
    draft: pull_request.draft,
  };

  if (!REVIEWABLE_ACTIONS.has(action)) {
    logDelivery(deliveryFields, "skipped-wrong-action");
    return c.text(`ignored: action "${action}"`, 200);
  }
  if (pull_request.draft) {
    logDelivery(deliveryFields, "skipped-draft");
    return c.text("ignored: draft PR", 200);
  }

  let result: EnqueueResult;
  try {
    result = await enqueueReviewJob({
      installationId: installation.id,
      owner: repository.owner.login,
      repo: repository.name,
      pullNumber: number,
      headSha: pull_request.head.sha,
      baseSha: pull_request.base.sha,
    });
  } catch (error) {
    logger.error({ ...deliveryFields, err: error }, "webhook delivery: failed to enqueue review job");
    logDelivery(deliveryFields, "error");
    return c.text("error enqueueing review job", 500);
  }

  logDelivery(deliveryFields, result);
  return c.text(result, 200);
});
