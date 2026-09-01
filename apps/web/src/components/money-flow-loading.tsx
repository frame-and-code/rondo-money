'use client';

import { Card } from '@rondo/ui/components/ui/card';
import { Skeleton } from '@rondo/ui/components/ui/skeleton';
import { type ReactNode } from 'react';

import { LoadingRegion } from '@/components/loading-region';

const ACCOUNTS = [0, 1, 2];

const DAYS = [
  { key: 'today', rows: [0, 1, 2] },
  { key: 'earlier', rows: [0, 1] },
];

function Row({ testId }: { testId: string }): ReactNode {
  return (
    <li
      data-testid={testId}
      className="border-border/60 flex items-center gap-3 border-b px-4 py-3 last:border-b-0"
    >
      <Skeleton className="size-9 shrink-0 rounded-full" />
      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <Skeleton className="h-3.5 w-32" />
        <Skeleton className="h-3 w-20" />
      </span>
      <Skeleton className="h-3.5 w-16" />
      <span aria-hidden className="hidden size-8 shrink-0 sm:block" />
    </li>
  );
}

export function MoneyFlowLoading(): ReactNode {
  return (
    <LoadingRegion>
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="flex items-center gap-2 lg:hidden">
          <Skeleton className="h-11 flex-1 rounded-full" />
          <Skeleton className="size-11 shrink-0 rounded-full" />
        </div>

        <aside
          data-testid="loading-accounts"
          className="hidden w-full flex-col gap-3 lg:flex lg:max-w-xs"
        >
          <div className="flex flex-col gap-3">
            <Skeleton className="h-6 w-36" />
            <Skeleton className="h-10 w-full rounded-full" />
          </div>

          <Card className="overflow-hidden p-0">
            <ul className="flex flex-col">
              {ACCOUNTS.map((account) => (
                <Row key={account} testId="loading-account" />
              ))}
            </ul>
          </Card>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Skeleton className="h-9 w-28 rounded-full" />
            <Skeleton className="hidden h-9 w-40 rounded-2xl md:block" />
          </div>

          <div className="flex flex-col gap-5">
            {DAYS.map((day) => (
              <section key={day.key} data-testid="loading-day" className="flex flex-col gap-1.5">
                <header className="flex items-baseline gap-3 px-4">
                  <Skeleton className="h-4 w-40" />
                  <span className="flex-1" />
                  <Skeleton className="h-3 w-16" />
                  <span aria-hidden className="hidden size-8 shrink-0 sm:block" />
                </header>

                <ul className="bg-card border-border/60 flex flex-col overflow-hidden rounded-[24px] border">
                  {day.rows.map((row) => (
                    <Row key={row} testId="loading-record" />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </div>
      </div>
    </LoadingRegion>
  );
}
