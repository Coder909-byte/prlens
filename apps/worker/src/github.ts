import { readFileSync } from "node:fs";
import { App } from "@octokit/app";
import { Octokit } from "octokit";
import { config } from "@prlens/shared";

function loadPrivateKey(): string {
  if (config.GITHUB_PRIVATE_KEY) return config.GITHUB_PRIVATE_KEY;
  // GITHUB_PRIVATE_KEY_PATH's presence is enforced by config.ts's refine().
  return readFileSync(config.GITHUB_PRIVATE_KEY_PATH!, "utf8");
}

// Pass the `octokit` package's Octokit (rest + paginate plugins already
// mixed in) so getInstallationOctokit() returns a client typed with
// `.rest.*` and `.paginate`, not the bare @octokit/core client.
export const githubApp = new App({
  appId: config.GITHUB_APP_ID,
  privateKey: loadPrivateKey(),
  webhooks: { secret: config.GITHUB_WEBHOOK_SECRET },
  Octokit,
});

export async function getInstallationOctokit(installationId: number) {
  return githubApp.getInstallationOctokit(installationId);
}
