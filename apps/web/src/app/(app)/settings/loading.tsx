'use client';

import { Card, CardContent, CardHeader } from '@rondo/ui/components/ui/card';
import { Skeleton } from '@rondo/ui/components/ui/skeleton';

import { LoadingRegion } from '@/components/loading-region';

const TITLE_WIDTHS = ['w-24', 'w-36', 'w-18', 'w-32'];

export default function SettingsLoading() {
  return (
    <LoadingRegion>
      <div className="grid items-start gap-6 md:grid-cols-2 xl:grid-cols-3">
        {TITLE_WIDTHS.map((width) => (
          <Card key={width} className="[--card-spacing:--spacing(6)]">
            <CardHeader className="gap-2">
              <Skeleton className={`h-4 ${width}`} />
              <Skeleton className="h-3 w-full" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-full rounded-lg" />
            </CardContent>
          </Card>
        ))}
      </div>
    </LoadingRegion>
  );
}
