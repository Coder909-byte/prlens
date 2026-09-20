function Row() {
  return <div className="h-9 animate-pulse border-b border-border-row bg-surface" />;
}

export default function Loading() {
  return (
    <div className="flex min-h-screen bg-bg text-[13px]">
      <div className="w-[216px] shrink-0 border-r border-border-sidebar bg-sidebar" />
      <main className="flex grow flex-col gap-4 p-7 px-8">
        <div className="h-7 w-32 animate-pulse rounded bg-surface" />
        <div className="h-8 w-[280px] animate-pulse rounded-[5px] bg-surface" />
        <div className="overflow-hidden rounded-card border border-border">
          <div className="h-[34px] bg-surface-header" />
          {Array.from({ length: 7 }, (_, i) => (
            <Row key={i} />
          ))}
        </div>
      </main>
    </div>
  );
}
