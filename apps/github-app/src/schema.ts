import { z } from "zod";

/**
 * Only the subset of the pull_request webhook payload we actually use.
 * Anything else GitHub sends is ignored - keeps this resilient to payload
 * fields we don't care about changing.
 */
export const PullRequestWebhookSchema = z.object({
  action: z.string(),
  number: z.number(),
  pull_request: z.object({
    draft: z.boolean(),
    head: z.object({ sha: z.string() }),
    base: z.object({ sha: z.string() }),
  }),
  repository: z.object({
    name: z.string(),
    owner: z.object({ login: z.string() }),
  }),
  installation: z.object({ id: z.number() }),
});

export type PullRequestWebhookPayload = z.infer<typeof PullRequestWebhookSchema>;
