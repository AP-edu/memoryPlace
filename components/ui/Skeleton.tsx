// Loading placeholders that match the app's card layouts, so pages don't
// flash bare "Loading…" text. Decorative: screen readers get one status line.

export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`animate-pulse rounded-xl bg-muted ${className}`} />;
}

export function CardGridSkeleton({ cards = 3 }: { cards?: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-hidden>
      {Array.from({ length: cards }, (_, i) => (
        <div key={i} className="card-base p-4">
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="mt-3 h-3 w-1/2" />
          <div className="mt-4 flex gap-2">
            <Skeleton className="h-8 w-16" />
            <Skeleton className="h-8 w-16" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function PageSkeleton({ label = "Loading", cards = 3 }: { label?: string; cards?: number }) {
  return (
    <div role="status" aria-busy="true" className="mx-auto max-w-5xl p-4 sm:p-6">
      <span className="sr-only">{label}…</span>
      <Skeleton className="h-9 w-48" />
      <Skeleton className="mb-6 mt-3 h-4 w-72 max-w-full" />
      <CardGridSkeleton cards={cards} />
    </div>
  );
}
