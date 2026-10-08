'use client';

import { Card } from '@rondo/ui/components/ui/card';
import { Skeleton } from '@rondo/ui/components/ui/skeleton';
import { type ReactNode } from 'react';

import { LoadingRegion } from '@/components/loading-region';

const BLOCKS = [
  { key: 'accounts', rows: [0, 1, 2] },
  { key: 'assets', rows: [0, 1] },
  { key: 'liabilities', rows: [0, 1] },
];

export function NetWorthLoading(): ReactNode {
  return (
    <LoadingRegion>
      <div className="flex flex-col gap-8">
        <div data-testid="loading-net-worth-total" className="flex flex-col gap-2.5">
          <Skeleton className="h-3.5 w-16" />
          <Skeleton className="h-11 w-64" />
          <Skeleton className="h-3.5 w-80 max-w-full" />
        </div>

        <div className="grid gap-6 lg:grid-cols-3 lg:items-start">
          {BLOCKS.map((block) => (
            <section
              key={block.key}
              data-testid="loading-net-worth-block"
              className="flex min-w-0 flex-col gap-3"
            >
              <div className="flex min-h-8 items-center justify-between gap-3">
                <Skeleton className="h-6 w-28" />
                {block.key === 'accounts' ? null : <Skeleton className="h-8 w-36 rounded-2xl" />}
              </div>

              <Card className="overflow-hidden p-0">
                <ul className="flex flex-col">
                  {block.rows.map((row) => (
                    <li
                      key={row}
                      data-testid="loading-net-worth-row"
                      className="border-border/60 flex items-center gap-3 border-b px-4 py-3 last:border-b-0"
                    >
                      <Skeleton className="size-9 shrink-0 rounded-full" />
                      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                        <Skeleton className="h-3.5 w-28" />
                        <Skeleton className="h-3 w-20" />
                      </span>
                      <Skeleton className="h-3.5 w-20" />
                      <span aria-hidden className="size-8 shrink-0" />
                    </li>
                  ))}
                </ul>
              </Card>
            </section>
          ))}
        </div>
      </div>
    </LoadingRegion>
  );
}
