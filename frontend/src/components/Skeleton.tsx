export function SkeletonBox({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-xl bg-ink/5 dark:bg-white/10 ${className}`}
    />
  );
}

export function ProductCardSkeleton() {
  return (
    <div className="flex flex-col rounded-2xl border border-ink/10 dark:border-white/10 bg-white/70 dark:bg-stone-900/70 p-3 shadow-sm">
      <SkeletonBox className="aspect-[4/3] w-full rounded-xl" />
      <div className="mt-3 space-y-2">
        <SkeletonBox className="h-4 w-3/4" />
        <SkeletonBox className="h-3 w-1/2" />
        <div className="flex items-center justify-between pt-2">
          <SkeletonBox className="h-5 w-1/3" />
          <SkeletonBox className="h-6 w-16 rounded-full" />
        </div>
      </div>
    </div>
  );
}

export function DealCardSkeleton() {
  return (
    <div className="rounded-2xl border border-ink/10 dark:border-white/10 bg-white/80 dark:bg-stone-900/80 p-5 space-y-4">
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <SkeletonBox className="h-5 w-48" />
          <SkeletonBox className="h-3 w-32" />
        </div>
        <SkeletonBox className="h-6 w-24 rounded-full" />
      </div>
      <div className="flex gap-4">
        <SkeletonBox className="h-20 w-20 rounded-xl" />
        <div className="flex-1 space-y-2">
          <SkeletonBox className="h-4 w-full" />
          <SkeletonBox className="h-4 w-2/3" />
          <SkeletonBox className="h-4 w-1/3" />
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <SkeletonBox className="h-9 w-24 rounded-xl" />
        <SkeletonBox className="h-9 w-28 rounded-xl" />
      </div>
    </div>
  );
}

export function MetricsSkeleton() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="rounded-2xl bg-white/70 dark:bg-stone-900/70 p-4 border border-ink/10 dark:border-white/10 space-y-2">
          <SkeletonBox className="h-4 w-16" />
          <SkeletonBox className="h-8 w-24" />
          <SkeletonBox className="h-3 w-20" />
        </div>
      ))}
    </div>
  );
}
