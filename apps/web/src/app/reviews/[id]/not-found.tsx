import Link from "next/link";
import { Sidebar } from "@/components/sidebar";

export default function ReviewNotFound() {
  return (
    <div className="flex min-h-screen bg-bg text-[13px] text-text">
      <Sidebar activePath="/reviews" />
      <main className="flex grow flex-col items-center justify-center gap-3">
        <h1 className="text-[18px] font-semibold text-text-strong">Review not found</h1>
        <p className="text-[13px] text-text-muted">It may have been superseded by a newer review on the same PR, or the id is wrong.</p>
        <Link href="/reviews" className="rounded-[5px] border border-border-strong bg-[#1d232b] px-3 py-1.5 text-[12px] text-text-strong">
          ← Back to reviews
        </Link>
      </main>
    </div>
  );
}
