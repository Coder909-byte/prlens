export function StatCard({ label, value, sub, children }: { label: string; value: string; sub?: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-card border border-border bg-surface p-3.5">
      <span className="text-[11px] uppercase tracking-[0.07em] text-text-faint">{label}</span>
      <span className="font-mono text-[28px] font-medium tracking-[-0.02em] text-text-strong">{value}</span>
      {sub && <span className="text-[12px] text-text-faint">{sub}</span>}
      {children}
    </div>
  );
}
