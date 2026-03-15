export function LoadingGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="glass-card p-4">
          <div className="skeleton aspect-square w-full" />
          <div className="mt-3 space-y-2">
            <div className="skeleton h-4 w-2/3" />
            <div className="skeleton h-3 w-1/2" />
            <div className="skeleton h-2 w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}
