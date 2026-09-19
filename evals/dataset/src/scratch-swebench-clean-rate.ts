import { readFileSync } from "node:fs";
import { createMinerOctokit } from "./github.js";
import { ensureCloned, lineHistory, showCommitFilePatch } from "./clone.js";
import { resolveOwningPr, deriveGroundTruth } from "./groundTruth.js";

interface OldRange {
  file: string;
  startLine: number;
  endLine: number;
}

interface Instance {
  instance_id: string;
  repo: string;
  base_commit: string;
  patch: string;
}

const MAX_INTRODUCING_PATCH_LINES = 200; // mirrors buildReviewData.ts

function isFileCreationDiff(patch: string): boolean {
  return /^--- \/dev\/null/m.test(patch) || /^new file mode/m.test(patch);
}

/** Same parser as the earlier scratch check: old-side (pre-fix) line range per file, covering every deleted line. */
function oldRangesForPatch(patch: string): OldRange[] {
  const ranges: OldRange[] = [];
  let currentFile: string | null = null;
  let oldLine = 0;
  let inHunk = false;
  let hunkOldLines: number[] = [];

  function flushHunk() {
    if (currentFile && hunkOldLines.length > 0) {
      ranges.push({ file: currentFile, startLine: Math.min(...hunkOldLines), endLine: Math.max(...hunkOldLines) });
    }
    hunkOldLines = [];
  }

  for (const raw of patch.split("\n")) {
    const fileMatch = /^diff --git a\/(.+?) b\//.exec(raw);
    if (fileMatch) {
      flushHunk();
      currentFile = fileMatch[1]!;
      inHunk = false;
      continue;
    }
    if (raw.startsWith("--- ") || raw.startsWith("+++ ")) continue;
    const hunkMatch = /^@@ -(\d+)(?:,\d+)? \+\d+(?:,\d+)? @@/.exec(raw);
    if (hunkMatch) {
      flushHunk();
      oldLine = Number(hunkMatch[1]);
      inHunk = true;
      continue;
    }
    if (!currentFile || !inHunk) continue;
    const marker = raw.charAt(0);
    if (marker === "-") {
      hunkOldLines.push(oldLine);
      oldLine++;
    } else if (marker === " ") {
      oldLine++;
    }
  }
  flushHunk();
  return ranges;
}

type Outcome =
  | "clean"
  | "pure-addition"
  | "no-history"
  | "rename"
  | "no-owning-pr"
  | "multi-pr-or-not-found"
  | "needs-review-downgrade"
  | "unusable-origin";

async function classifyRange(
  octokit: ReturnType<typeof createMinerOctokit>,
  owner: string,
  repo: string,
  repoDir: string,
  baseCommit: string,
  range: OldRange,
): Promise<{ outcome: Outcome; detail: string }> {
  const history = await lineHistory(repoDir, range.file, range.startLine, range.endLine, baseCommit);
  if (history.length === 0) return { outcome: "no-history", detail: "git log -L produced no history" };

  const introducing = history[0]!;
  if (introducing.looksLikeRename) return { outcome: "rename", detail: `introducing commit ${introducing.sha.slice(0, 7)} shows a rename` };

  const owning = await resolveOwningPr(octokit, owner, repo, introducing.sha);
  if (owning.status === "multiple-prs" || owning.status === "not-found") {
    return { outcome: "multi-pr-or-not-found", detail: `owning=${owning.status}` };
  }
  if (owning.status === "no-pr") {
    // Same treatment as the real pipeline: no owning PR is ALWAYS needs-review
    // by design (no corroborating PR record for this attribution), never "clean".
    return { outcome: "no-owning-pr", detail: `introducing ${introducing.sha.slice(0, 7)} has no owning PR (direct push)` };
  }

  const gt = await deriveGroundTruth(octokit, owner, repo, repoDir, introducing.sha, owning.prNumber!, range.file, range.startLine, range.endLine);
  if (gt.ranges.length === 0) return { outcome: "needs-review-downgrade", detail: gt.note ?? "no matching hunk" };
  if (gt.confidence === "needs-review") return { outcome: "needs-review-downgrade", detail: gt.note ?? "downgraded" };

  // Passed deriveGroundTruth at high/medium confidence - now apply the same
  // final display-diff check buildReviewData.ts uses before calling
  // something usable (file creation / oversized).
  const { data: prFiles } = await octokit.rest.pulls.listFiles({ owner, repo, pull_number: owning.prNumber!, per_page: 100 });
  const displayPatch = prFiles.find((f) => f.filename === range.file)?.patch ?? "";
  if (!displayPatch) return { outcome: "unusable-origin", detail: "pulls.listFiles omits patch for this file" };
  if (isFileCreationDiff(displayPatch)) return { outcome: "unusable-origin", detail: "introducing PR creates this file from scratch" };
  const lineCount = displayPatch.split("\n").length;
  if (lineCount > MAX_INTRODUCING_PATCH_LINES) return { outcome: "unusable-origin", detail: `introducing diff is ${lineCount} lines` };

  return { outcome: "clean", detail: `PR #${owning.prNumber}, confidence ${gt.confidence}` };
}

async function main(): Promise<void> {
  const octokit = createMinerOctokit();
  const instances = JSON.parse(readFileSync("/tmp/swebench20/instances.json", "utf8")) as Instance[];

  const counts: Record<Outcome | "pure-addition", number> = {
    clean: 0,
    "pure-addition": 0,
    "no-history": 0,
    rename: 0,
    "no-owning-pr": 0,
    "multi-pr-or-not-found": 0,
    "needs-review-downgrade": 0,
    "unusable-origin": 0,
  };
  let totalRanges = 0;
  let instancesWithAtLeastOneClean = 0;

  for (const inst of instances) {
    const [owner, repoRaw] = inst.repo.split("/") as [string, string];
    console.log(`\n=== ${inst.instance_id} (base ${inst.base_commit.slice(0, 7)}) ===`);
    const repoDir = await ensureCloned({ owner, name: repoRaw }, 5);

    const ranges = oldRangesForPatch(inst.patch);
    const allFiles = [...inst.patch.matchAll(/^diff --git a\/(.+?) b\//gm)].map((m) => m[1]!);
    const filesWithRanges = new Set(ranges.map((r) => r.file));
    const additionOnly = allFiles.filter((f) => !filesWithRanges.has(f));
    counts["pure-addition"] += additionOnly.length;
    if (additionOnly.length > 0) console.log(`  (pure-addition, nothing to trace: ${additionOnly.join(", ")})`);

    let instanceHasClean = false;
    for (const range of ranges) {
      totalRanges++;
      const { outcome, detail } = await classifyRange(octokit, owner, repoRaw, repoDir, inst.base_commit, range);
      counts[outcome] += 1;
      if (outcome === "clean") instanceHasClean = true;
      console.log(`  ${range.file}:${range.startLine}-${range.endLine} -> ${outcome} (${detail})`);
    }
    if (instanceHasClean) instancesWithAtLeastOneClean++;
  }

  console.log(`\n=== SUMMARY (${instances.length} instances, ${totalRanges} old-side ranges + ${counts["pure-addition"]} pure-addition) ===`);
  for (const [k, v] of Object.entries(counts)) {
    if (k === "pure-addition") continue;
    console.log(`  ${k.padEnd(24)} ${v}`);
  }
  console.log(`\nClean-trace rate (of traceable ranges): ${counts.clean}/${totalRanges} = ${((100 * counts.clean) / totalRanges).toFixed(1)}%`);
  console.log(`Instances with >=1 clean pair: ${instancesWithAtLeastOneClean}/${instances.length} = ${((100 * instancesWithAtLeastOneClean) / instances.length).toFixed(1)}%`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
