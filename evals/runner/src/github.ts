import { Octokit } from "octokit";

/**
 * A plain PAT client, same reasoning as evals/dataset/src/github.ts: the
 * pairs' repos are public OSS projects the GitHub App isn't installed on,
 * so the App's installation token can't read them - only a PAT can. Kept as
 * its own small copy rather than importing evals/dataset (whose package
 * entry point is its CLI's `main()`, which would execute on import) - two
 * independent eval-tooling CLIs, each self-contained.
 */
export function createEvalOctokit(): Octokit {
  const token = process.env.GITHUB_MINER_TOKEN;
  if (!token) {
    throw new Error(
      "GITHUB_MINER_TOKEN is required (a plain GitHub Personal Access Token for public-repo read - " +
        "NOT the App credentials). See .env.example.",
    );
  }

  return new Octokit({
    auth: token,
    throttle: {
      onRateLimit: (retryAfter: number, options: { method: string; url: string }, _octokit: unknown, retryCount: number) => {
        console.warn(`[eval] primary rate limit hit: ${options.method} ${options.url} - retrying after ${retryAfter}s (attempt ${retryCount + 1})`);
        return retryCount < 3;
      },
      onSecondaryRateLimit: (retryAfter: number, options: { method: string; url: string }, _octokit: unknown, retryCount: number) => {
        console.warn(`[eval] secondary rate limit hit: ${options.method} ${options.url} - retrying after ${retryAfter}s (attempt ${retryCount + 1})`);
        return retryCount < 3;
      },
    },
    retry: { doNotRetry: [] },
  });
}
