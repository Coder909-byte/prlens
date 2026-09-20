"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

/** The one client component on /reviews: pushes `q` into the URL on submit, everything else (filtering, sorting, pagination) stays server-rendered. */
export function SearchBox({ initialQuery }: { initialQuery: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(initialQuery);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams(searchParams);
    if (value) params.set("q", value);
    else params.delete("q");
    router.push(`/reviews?${params.toString()}`);
  }

  return (
    <form onSubmit={submit} className="flex h-8 w-[280px] items-center gap-2 rounded-[5px] border border-border-strong bg-surface px-2.5 text-text-dim">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <label className="sr-only" htmlFor="q">
        Filter reviews
      </label>
      <input
        id="q"
        type="search"
        placeholder="repo, PR, model…"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="grow min-w-0 bg-transparent text-[12px] text-text outline-none"
      />
    </form>
  );
}
