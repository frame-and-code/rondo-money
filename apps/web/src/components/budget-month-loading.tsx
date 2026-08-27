'use client';

import { Skeleton } from '@rondo/ui/components/ui/skeleton';

import { LoadingRegion } from '@/components/loading-region';

const GROUPS = [3, 4, 3];

export function BudgetMonthLoading() {
  return (
    <LoadingRegion>
      <div className="bg-card flex items-center justify-between gap-6 rounded-3xl px-6 py-5 ring-1 ring-black/5 dark:ring-white/10">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-3 w-19" />
          <Skeleton className="h-8 w-49" />
          <Skeleton className="h-3 w-37" />
        </div>
        <Skeleton className="h-9 w-53 rounded-2xl" />
      </div>

      {GROUPS.map((tiles, group) => (
        <div key={group} className="flex flex-col gap-2.5">
          <div className="flex items-center gap-3">
            <Skeleton className="h-4 w-42" />
            <div className="h-px flex-1 bg-black/5 dark:bg-white/10" />
            <Skeleton className="h-3.5 w-29" />
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: tiles }, (_, tile) => (
              <div
                key={tile}
                className="bg-card flex items-center gap-4 rounded-[20px] p-4 ring-1 ring-black/5 dark:ring-white/10"
              >
                <Skeleton className="size-18 rounded-full" />
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <Skeleton className="h-3.5 w-8/12" />
                  <Skeleton className="h-5 w-27" />
                  <Skeleton className="h-3 w-22" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </LoadingRegion>
  );
}
