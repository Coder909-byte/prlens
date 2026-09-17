import { describe, expect, it } from "vitest";
import { Webhooks } from "@octokit/webhooks";

// Exercises the same @octokit/webhooks verify() call app.ts uses, without
// importing app.ts itself (which pulls in @prlens/shared's config and would
// require every env var to be set just to run this test).
describe("webhook signature verification", () => {
  const secret = "test-secret";
  const webhooks = new Webhooks({ secret });
  const payload = JSON.stringify({ hello: "world" });

  it("accepts a correctly signed payload", async () => {
    const signature = await webhooks.sign(payload);
    await expect(webhooks.verify(payload, signature)).resolves.toBe(true);
  });

  it("rejects a payload signed with the wrong secret", async () => {
    const wrongWebhooks = new Webhooks({ secret: "wrong-secret" });
    const signature = await wrongWebhooks.sign(payload);
    await expect(webhooks.verify(payload, signature)).resolves.toBe(false);
  });

  it("rejects a tampered payload", async () => {
    const signature = await webhooks.sign(payload);
    const tampered = JSON.stringify({ hello: "tampered" });
    await expect(webhooks.verify(tampered, signature)).resolves.toBe(false);
  });
});
