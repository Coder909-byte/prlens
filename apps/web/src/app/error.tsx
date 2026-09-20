"use client";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg text-[13px] text-text">
      <div className="flex w-[420px] flex-col gap-4 rounded-card border border-sev-critical-border bg-surface p-6">
        <div className="flex items-center gap-2.5">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-sev-critical)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v5M12 16.5v.5" />
          </svg>
          <h1 className="text-[15px] font-semibold text-text-strong">Something went wrong loading this page</h1>
        </div>
        <p className="m-0 font-mono text-[12px] leading-relaxed text-text-dim">{error.message || "Unknown error"}</p>
        <button type="button" onClick={reset} className="self-start rounded-[5px] border border-border-strong bg-[#1d232b] px-3 py-1.5 text-[12px] text-text-strong">
          Try again
        </button>
      </div>
    </div>
  );
}
