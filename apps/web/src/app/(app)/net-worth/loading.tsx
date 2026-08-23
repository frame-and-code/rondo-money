'use client';

import { Skeleton } from '@rondo/ui/components/ui/skeleton';

import { LoadingRegion } from '@/components/loading-region';

export default function NetWorthLoading() {
  return (
    <LoadingRegion>
      <div className="flex items-center gap-3">
        <Skeleton className="h-8 w-40" />
        <div className="flex-1" />
        <Skeleton className="h-8 w-24" />
      </div>
      <Skeleton className="h-80 w-full rounded-xl" />
      <div className="flex gap-4">
        <Skeleton className="h-3 w-26" />
        <Skeleton className="h-3 w-22" />
        <Skeleton className="h-3 w-30" />
      </div>
    </LoadingRegion>
  );
}
