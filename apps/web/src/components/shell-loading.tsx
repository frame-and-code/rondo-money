'use client';

import { Skeleton } from '@rondo/ui/components/ui/skeleton';

import { LoadingRegion } from '@/components/loading-region';

export function ShellLoading() {
  return (
    <div className="flex h-dvh flex-col gap-6 p-4 md:p-6">
      <div className="flex items-center gap-3">
        <Skeleton className="size-6 rounded-lg" />
        <Skeleton className="h-4 w-32" />
      </div>
      <LoadingRegion>
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </LoadingRegion>
    </div>
  );
}
