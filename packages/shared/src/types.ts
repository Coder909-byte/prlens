export interface ReviewJobData {
  installationId: number;
  owner: string;
  repo: string;
  pullNumber: number;
  headSha: string;
  baseSha: string;
}
