import { Octokit } from "octokit";

/**
 * Tracks REST calls made through this client, for the pilot's "API calls
 * used" report - not exact (paginate() makes one call per page), but close
 * enough to judge feasibility of scaling up.
 */
export const apiCallCounter = { count: 0 };

export function createMinerOctokit(): Octokit {
  const token = process.env.GITHUB_MINER_TOKEN;
  if (!token) {
    throw new Error(
      "GITHUB_MINER_TOKEN is required (a plain GitHub Personal Access Token for public-repo read - " +
        "NOT the App credentials, which can't read repos the App isn't installed on). See .env.example.",
    );
  }

  // The `octokit` package already bundles @octokit/plugin-retry and
  // @octokit/plugin-throttling - just configure them, no separate plugin
  // wiring needed (see apps/worker/src/github.ts for the same package used
  // for its rest+paginate bundling).
  const octokit = new Octokit({
    auth: token,
    throttle: {
      onRateLimit: (retryAfter: number, options: { method: string; url: string }, _octokit: unknown, retryCount: number) => {
        console.warn(`[miner] primary rate limit hit: ${options.method} ${options.url} - retrying after ${retryAfter}s (attempt ${retryCount + 1})`);
        return retryCount < 3;
      },
      onSecondaryRateLimit: (retryAfter: number, options: { method: string; url: string }, _octokit: unknown, retryCount: number) => {
        console.warn(`[miner] secondary rate limit hit: ${options.method} ${options.url} - retrying after ${retryAfter}s (attempt ${retryCount + 1})`);
        return retryCount < 3;
      },
    },
    retry: { doNotRetry: [] },
  });

  octokit.hook.after("request", () => {
    apiCallCounter.count += 1;
  });

  return octokit;
}
