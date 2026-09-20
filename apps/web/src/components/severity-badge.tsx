import { FindingSeverity } from "@prlens/db";

const STYLES: Record<FindingSeverity, { color: string; bg: string; border: string; dot: string }> = {
  [FindingSeverity.CRITICAL]: { color: "var(--color-sev-critical-fg)", bg: "var(--color-sev-critical-bg)", border: "var(--color-sev-critical-border)", dot: "var(--color-sev-critical)" },
  [FindingSeverity.HIGH]: { color: "var(--color-sev-high-fg)", bg: "var(--color-sev-high-bg)", border: "var(--color-sev-high-border)", dot: "var(--color-sev-high)" },
  [FindingSeverity.MEDIUM]: { color: "var(--color-sev-medium-fg)", bg: "var(--color-sev-medium-bg)", border: "var(--color-sev-medium-border)", dot: "var(--color-sev-medium)" },
  [FindingSeverity.LOW]: { color: "var(--color-sev-low-fg)", bg: "var(--color-sev-low-bg)", border: "var(--color-sev-low-border)", dot: "var(--color-sev-low)" },
};

export function severityDotColor(severity: FindingSeverity): string {
  return STYLES[severity].dot;
}

export function SeverityBadge({ severity }: { severity: FindingSeverity }) {
  const s = STYLES[severity];
  return (
    <span
      className="rounded-[4px] border px-2 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-[0.04em]"
      style={{ color: s.color, background: s.bg, borderColor: s.border }}
    >
      {severity.toLowerCase()}
    </span>
  );
}

export function SeverityDot({ severity }: { severity: FindingSeverity }) {
  return <span className="inline-block h-[7px] w-[7px] rounded-[2px]" style={{ background: STYLES[severity].dot }} />;
}
