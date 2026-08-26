'use client';

import { Skeleton } from '@rondo/ui/components/ui/skeleton';

import { LoadingRegion } from '@/components/loading-region';

export function OnboardingLoading() {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-6xl flex-col px-5 pt-5 pb-10 md:justify-center md:px-6 md:py-16">
      <div className="grid gap-10 md:grid-cols-2 md:items-center md:gap-16">
        <LoadingRegion>
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-48" />
        </LoadingRegion>
        <Skeleton className="h-80 w-full rounded-3xl" />
      </div>
    </main>
  );
}
