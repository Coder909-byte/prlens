function SkeletonCard({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-card border border-border bg-surface ${className}`} />;
}

export default function Loading() {
  return (
    <div className="flex min-h-screen bg-bg text-[13px]">
      <div className="w-[216px] shrink-0 border-r border-border-sidebar bg-sidebar" />
      <main className="flex grow flex-col gap-5 p-7 px-8">
        <div className="h-7 w-40 animate-pulse rounded bg-surface" />
        <div className="grid grid-cols-5 gap-3">
          {Array.from({ length: 5 }, (_, i) => (
            <SkeletonCard key={i} className="h-[86px]" />
          ))}
        </div>
        <SkeletonCard className="h-[120px]" />
        <div className="grid grid-cols-2 gap-3">
          <SkeletonCard className="h-[200px]" />
          <SkeletonCard className="h-[200px]" />
        </div>
        <SkeletonCard className="h-[260px]" />
      </main>
    </div>
  );
}
