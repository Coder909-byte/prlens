function SkeletonCard({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-card border border-border bg-surface ${className}`} />;
}

export default function Loading() {
  return (
    <div className="flex min-h-screen bg-bg text-[13px]">
      <div className="w-[216px] shrink-0 border-r border-border-sidebar bg-sidebar" />
      <main className="flex grow flex-col gap-5 p-6 px-8">
        <div className="h-4 w-16 animate-pulse rounded bg-surface" />
        <div className="flex flex-col gap-3 border-b border-border-header pb-5">
          <div className="h-4 w-56 animate-pulse rounded bg-surface" />
          <div className="h-7 w-96 animate-pulse rounded bg-surface" />
        </div>
        <div className="flex gap-6">
          <div className="flex grow flex-col gap-3">
            {Array.from({ length: 3 }, (_, i) => (
              <SkeletonCard key={i} className="h-[140px]" />
            ))}
          </div>
          <SkeletonCard className="h-[220px] w-[300px] shrink-0" />
        </div>
      </main>
    </div>
  );
}
