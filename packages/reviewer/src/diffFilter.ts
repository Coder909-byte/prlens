export interface PrFile {
  filename: string;
  status: string;
  patch?: string | undefined;
}

export interface IncludedFile {
  filename: string;
  status: string;
  patch: string;
}

export interface SkippedFile {
  filename: string;
  reason: "removed" | "binary" | "lockfile" | "generated" | "diff size cap";
}

const LOCKFILE_NAMES = new Set([
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "npm-shrinkwrap.json",
  "Cargo.lock",
  "Gemfile.lock",
  "poetry.lock",
  "composer.lock",
  "go.sum",
]);

const GENERATED_PATH_SEGMENT = /(^|\/)(dist|build|vendor|generated|node_modules)\//;
const GENERATED_FILE_SUFFIX = /\.(min\.js|min\.css|map)$/;

function basename(filename: string): string {
  return filename.split("/").pop() ?? filename;
}

function classifySkip(file: PrFile): SkippedFile["reason"] | null {
  if (file.status === "removed") return "removed";
  if (!file.patch) return "binary";
  if (LOCKFILE_NAMES.has(basename(file.filename))) return "lockfile";
  if (GENERATED_PATH_SEGMENT.test(file.filename) || GENERATED_FILE_SUFFIX.test(file.filename)) return "generated";
  return null;
}

export interface DiffFilterResult {
  included: IncludedFile[];
  skipped: SkippedFile[];
}

/**
 * Filters the PR's changed files down to what we actually send to the LLM:
 * drops lockfiles, generated/minified files, binaries and removed files,
 * then caps the total diff size at maxDiffBytes (files beyond the cap are
 * skipped too, in their original order). Every skip is reported so it can
 * be mentioned in the review body.
 */
export function filterDiffFiles(files: PrFile[], maxDiffBytes: number): DiffFilterResult {
  const skipped: SkippedFile[] = [];
  const candidates: IncludedFile[] = [];

  for (const file of files) {
    const skipReason = classifySkip(file);
    if (skipReason) {
      skipped.push({ filename: file.filename, reason: skipReason });
      continue;
    }
    candidates.push({ filename: file.filename, status: file.status, patch: file.patch! });
  }

  const included: IncludedFile[] = [];
  let totalBytes = 0;
  for (const file of candidates) {
    const size = Buffer.byteLength(file.patch, "utf8");
    if (totalBytes + size > maxDiffBytes) {
      skipped.push({ filename: file.filename, reason: "diff size cap" });
      continue;
    }
    totalBytes += size;
    included.push(file);
  }

  return { included, skipped };
}
