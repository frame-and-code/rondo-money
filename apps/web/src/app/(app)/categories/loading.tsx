'use client';

import { Skeleton } from '@rondo/ui/components/ui/skeleton';

import { LoadingRegion } from '@/components/loading-region';

const GROUPS = [3, 2, 2];

export default function CategoriesLoading() {
  return (
    <LoadingRegion>
      <div className="flex items-center gap-3">
        <Skeleton className="h-8 w-33" />
        <div className="flex-1" />
        <Skeleton className="h-8 w-45" />
      </div>
      <div className="flex items-center gap-4">
        <Skeleton className="h-3 w-24" />
        <div className="flex-1" />
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-3 w-24" />
      </div>
      {GROUPS.map((rows, group) => (
        <div key={group} className="flex flex-col gap-4">
          <Skeleton className="h-4 w-40" />
          {Array.from({ length: rows }, (_, row) => (
            <div key={row} className="flex items-center gap-4">
              <Skeleton className="h-3.5 w-36" />
              <div className="flex-1" />
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-3.5 w-24" />
            </div>
          ))}
        </div>
      ))}
    </LoadingRegion>
  );
}
