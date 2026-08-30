'use client';

import { Skeleton } from '@rondo/ui/components/ui/skeleton';

import { LoadingRegion } from '@/components/loading-region';

const ROWS = [0, 1, 2, 3];

export default function AccountsLoading() {
  return (
    <LoadingRegion>
      {ROWS.map((row) => (
        <div key={row} className="flex max-w-xl items-center gap-3">
          <Skeleton className="size-8 rounded-full" />
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-3.5 w-36" />
            <Skeleton className="h-3 w-20" />
          </div>
          <Skeleton className="h-4 w-20" />
        </div>
      ))}

      <div className="flex max-w-xl items-baseline justify-between gap-3 pt-2">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-6 w-28" />
      </div>
    </LoadingRegion>
  );
}
