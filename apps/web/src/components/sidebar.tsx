import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatTimestamp } from "@/lib/format";

const NAV = [
  {
    href: "/",
    label: "Overview",
    icon: (
      <>
        <rect x="3" y="3" width="7" height="9" rx="1" />
        <rect x="14" y="3" width="7" height="5" rx="1" />
        <rect x="14" y="12" width="7" height="9" rx="1" />
        <rect x="3" y="16" width="7" height="5" rx="1" />
      </>
    ),
  },
  {
    href: "/reviews",
    label: "Reviews",
    icon: <path d="M4 6h16M4 12h16M4 18h16" />,
  },
  {
    href: "/benchmark",
    label: "Benchmark",
    icon: <path d="M5 20V10M12 20V4M19 20v-7" />,
  },
] as const;

export async function Sidebar({ activePath }: { activePath: string }) {
  const [session, reviewCount, repoRows, lastReview] = await Promise.all([
    auth(),
    prisma.review.count(),
    prisma.review.findMany({ select: { owner: true, repo: true }, distinct: ["owner", "repo"] }),
    prisma.review.findFirst({ orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
  ]);

  return (
    <nav
      aria-label="Primary"
      className="flex w-[216px] shrink-0 flex-col gap-[22px] border-r border-border-sidebar bg-sidebar p-3"
    >
      <div className="flex items-center gap-2.5 px-2 py-0.5">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="10.5" cy="10.5" r="6.5" />
          <path d="M15.5 15.5 21 21" />
          <path d="M8 10.5h5" />
        </svg>
        <span className="text-[15px] font-semibold tracking-tight text-text-strong">PRLens</span>
      </div>

      <div className="flex flex-col gap-0.5 rounded-md border border-border-sidebar bg-bg p-2.5">
        <span className="font-mono text-[12px] text-text-secondary">{session?.user?.name ?? session?.user?.email ?? "signed in"}</span>
        <span className="text-[11px] text-text-dim">{repoRows.length} repo{repoRows.length === 1 ? "" : "s"} connected</span>
      </div>

      <div className="flex flex-col gap-0.5">
        {NAV.map((item) => {
          const isActive = item.href === "/" ? activePath === "/" : activePath.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={`flex items-center gap-2.5 rounded-[5px] px-2.5 py-2 text-[13px] ${
                isActive ? "bg-[#171b21] text-text-strong" : "text-text-muted hover:text-text-secondary"
              }`}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                {item.icon}
              </svg>
              <span className="grow">{item.label}</span>
              {item.href === "/reviews" && <span className="font-mono text-[11px] text-text-dim">{reviewCount}</span>}
            </Link>
          );
        })}
      </div>

      <div className="mt-auto flex flex-col gap-1.5 border-t border-border-sidebar pt-2.5">
        <div className="flex items-center gap-2 text-[12px] text-text-tertiary">
          <span className="h-[7px] w-[7px] rounded-full bg-accent" />
          GitHub App active
        </div>
        <span className="font-mono text-[11px] text-text-dim">{lastReview ? `last review ${formatTimestamp(lastReview.createdAt)}` : "no reviews yet"}</span>
      </div>
    </nav>
  );
}
