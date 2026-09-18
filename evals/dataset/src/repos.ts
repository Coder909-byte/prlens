import type { RepoRef } from "./types.js";

/**
 * Pilot-validate before full-scale mining (see the M2 plan) - this is a
 * starting shortlist, not a commitment. All: widely-used libraries (not
 * sprawling apps, moderate clone size), GitHub-native issue/PR culture
 * (needed for the "fixes #N" link method), logic-bug-prone domains a
 * diff-only reviewer could plausibly catch, TS/JS or Python per CLAUDE.md's
 * tree-sitter scope.
 */
export const CANDIDATE_REPOS: RepoRef[] = [
  { owner: "sindresorhus", name: "got" },
  { owner: "axios", name: "axios" },
  { owner: "date-fns", name: "date-fns" },
  { owner: "expressjs", name: "express" },
  { owner: "psf", name: "requests" },
  { owner: "pallets", name: "flask" },
  { owner: "pallets", name: "click" },
  { owner: "tiangolo", name: "fastapi" },
];
