import { signIn } from "@/lib/auth";

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ callbackUrl?: string }> }) {
  const { callbackUrl } = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg">
      <div className="flex w-[360px] flex-col gap-6 rounded-card border border-border bg-surface p-8">
        <div className="flex items-center gap-2.5">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="10.5" cy="10.5" r="6.5" />
            <path d="M15.5 15.5 21 21" />
            <path d="M8 10.5h5" />
          </svg>
          <span className="text-[15px] font-semibold tracking-tight text-text-strong">PRLens</span>
        </div>
        <p className="text-[13px] leading-relaxed text-text-muted">This dashboard is restricted to one GitHub account. Sign in to continue.</p>
        <form
          action={async () => {
            "use server";
            await signIn("github", { redirectTo: callbackUrl ?? "/" });
          }}
        >
          <button
            type="submit"
            className="flex w-full items-center justify-center gap-2 rounded-md border border-border-strong bg-[#1d232b] px-3 py-2.5 text-[13px] font-medium text-text-strong hover:bg-[#232a33]"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 2C6.48 2 2 6.58 2 12.25c0 4.53 2.87 8.37 6.84 9.73.5.1.68-.22.68-.49 0-.24-.01-.87-.01-1.71-2.78.62-3.37-1.37-3.37-1.37-.45-1.18-1.11-1.5-1.11-1.5-.91-.64.07-.62.07-.62 1 .07 1.53 1.05 1.53 1.05.89 1.57 2.34 1.11 2.91.85.09-.66.35-1.11.63-1.37-2.22-.26-4.56-1.14-4.56-5.06 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.31.1-2.73 0 0 .84-.27 2.75 1.05a9.3 9.3 0 0 1 5 0c1.91-1.32 2.75-1.05 2.75-1.05.55 1.42.2 2.47.1 2.73.64.72 1.03 1.63 1.03 2.75 0 3.93-2.34 4.79-4.57 5.05.36.32.68.94.68 1.9 0 1.37-.01 2.48-.01 2.81 0 .27.18.6.69.49A10.26 10.26 0 0 0 22 12.25C22 6.58 17.52 2 12 2Z" />
            </svg>
            Sign in with GitHub
          </button>
        </form>
        <a href="/benchmark" className="text-center text-[12px] text-text-dim">
          Looking for the benchmark? It&apos;s public →
        </a>
      </div>
    </div>
  );
}
