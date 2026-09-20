import { ReviewMode } from "@prlens/db";

export function modeLabel(mode: ReviewMode): string {
  return mode === ReviewMode.REPO_AWARE ? "repo-aware" : "diff-only";
}

export function ModeBadge({ mode }: { mode: ReviewMode }) {
  const isRepoAware = mode === ReviewMode.REPO_AWARE;
  return (
    <span
      className="rounded-[4px] px-[7px] py-0.5 font-mono text-[11px]"
      style={{
        color: isRepoAware ? "var(--color-mode-repo-aware)" : "var(--color-mode-diff-only)",
        background: isRepoAware ? "var(--color-mode-repo-aware-bg)" : "var(--color-mode-diff-only-bg)",
      }}
    >
      {modeLabel(mode)}
    </span>
  );
}
