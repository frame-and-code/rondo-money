'use client';

import { Skeleton } from '@rondo/ui/components/ui/skeleton';
import { cn } from '@rondo/ui/lib/utils';

import { LoadingRegion } from '@/components/loading-region';

const GROUPS = [3, 4, 3];

const HEADER = cn(
  'mb-5 flex flex-col gap-3',
  'md:bg-card md:flex-row md:flex-wrap md:items-center md:justify-between md:gap-6',
  'md:rounded-3xl md:px-6 md:py-5 md:shadow-xs md:ring-1 md:ring-black/5',
  'md:dark:ring-white/10',
);

const HEADER_AMOUNT = cn(
  'bg-card order-2 flex flex-col items-center gap-1.5 rounded-3xl px-6 py-5 shadow-xs',
  'ring-1 ring-black/5 dark:ring-white/10',
  'md:order-1 md:items-start md:rounded-none md:bg-transparent md:p-0 md:shadow-none',
  'md:ring-0 md:dark:ring-0',
);

const TILE = cn(
  'bg-card flex flex-col gap-3.5 rounded-[20px] p-4 pe-11',
  'shadow-xs ring-1 ring-black/5 dark:ring-white/10',
);

export function BudgetMonthLoading() {
  return (
    <LoadingRegion>
      <div>
        <div className={HEADER}>
          <div className="order-1 flex items-center justify-center gap-2 md:order-2">
            <Skeleton className="h-8 w-40 rounded-2xl" />
            <Skeleton className="h-8 w-24 rounded-2xl" />
          </div>

          <div className={HEADER_AMOUNT}>
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-10 w-52" />
            <Skeleton className="h-3.5 w-44" />
          </div>
        </div>

        <div className="flex flex-col gap-5.5">
          {GROUPS.map((tiles, group) => (
            <div key={group} className="flex flex-col gap-2.5">
              <div className="flex items-center gap-3">
                <Skeleton className="h-[30px] w-44 rounded-[10px]" />
                <div className="h-px flex-1 bg-black/6 dark:bg-white/10" />
                <span className="flex items-center gap-0.5">
                  <Skeleton className="size-7 rounded-lg" />
                  <Skeleton className="size-7 rounded-lg" />
                </span>
                <Skeleton className="h-4 w-28" />
              </div>

              <div className="grid gap-4 px-1 py-1 md:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: tiles }, (_, tile) => (
                  <div key={tile} data-testid="loading-tile" className={TILE}>
                    <span className="flex items-start justify-between gap-3">
                      <Skeleton className="mt-0.5 h-4 w-6/12" />
                      <span className="flex shrink-0 flex-col items-end gap-1.5">
                        <Skeleton className="h-5 w-24" />
                        <Skeleton className="h-3 w-16" />
                      </span>
                    </span>

                    <span className="flex items-center gap-4">
                      <Skeleton className="size-18 shrink-0 rounded-full" />
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="flex h-8 items-center justify-between gap-2">
                          <Skeleton className="h-3.5 w-20" />
                          <Skeleton className="h-3.5 w-16" />
                        </span>
                        <span className="flex h-8 items-center justify-between gap-2">
                          <Skeleton className="h-3.5 w-24" />
                          <Skeleton className="h-3.5 w-16" />
                        </span>
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </LoadingRegion>
  );
}
