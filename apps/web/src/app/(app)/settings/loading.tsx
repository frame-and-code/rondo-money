'use client';

import { Skeleton } from '@rondo/ui/components/ui/skeleton';

import { LoadingRegion } from '@/components/loading-region';

const LABEL_WIDTHS = ['w-24', 'w-18'];

export default function SettingsLoading() {
  return (
    <LoadingRegion>
      {LABEL_WIDTHS.map((width) => (
        <div key={width} className="flex max-w-md flex-col gap-1.5">
          <Skeleton className={`h-3 ${width}`} />
          <Skeleton className="h-8 w-full rounded-lg" />
        </div>
      ))}
      <Skeleton className="h-3 w-64" />
    </LoadingRegion>
  );
}
