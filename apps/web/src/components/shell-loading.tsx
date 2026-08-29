'use client';

import { Skeleton } from '@rondo/ui/components/ui/skeleton';
import { usePathname } from 'next/navigation';

import { BudgetMonthLoading } from '@/components/budget-month-loading';
import { LoadingRegion } from '@/components/loading-region';
import { activeSection, sections } from '@/lib/sections';

export function ShellLoading() {
  const pathname = usePathname();
  const current = activeSection(pathname);

  return (
    <div className="flex h-dvh overflow-hidden">
      <aside className="border-sidebar-border bg-sidebar hidden w-64 shrink-0 flex-col overflow-hidden border-r md:flex">
        <div className="border-sidebar-border flex h-14 shrink-0 items-center gap-2 border-b px-3">
          <Skeleton className="size-6 shrink-0 rounded-lg" />
          <Skeleton className="h-4 w-28" />
        </div>
        <div className="flex flex-col gap-1 p-2">
          {sections.map((section) => (
            <Skeleton key={section.href} className="h-8 w-full rounded-xl" />
          ))}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b px-4 md:px-6">
          <Skeleton className="hidden size-8 rounded-xl md:block" />
          <Skeleton className="h-4 w-32" />
          <div className="flex-1" />
          <Skeleton className="size-8 rounded-full" />
          <Skeleton className="size-8 rounded-full" />
          <Skeleton className="size-8 rounded-full" />
        </header>

        <main className="min-h-0 flex-1 overflow-hidden p-4 [scrollbar-gutter:stable] md:p-6">
          {current?.href === '/categories' ? (
            <BudgetMonthLoading />
          ) : (
            <LoadingRegion>
              <Skeleton className="h-64 w-full rounded-xl" />
            </LoadingRegion>
          )}
        </main>

        <nav className="bg-card grid shrink-0 auto-cols-fr grid-flow-col border-t px-2 pt-2 pb-6 md:hidden">
          {sections.map((section) => (
            <span
              key={section.href}
              className="flex min-h-12 flex-col items-center justify-center gap-1"
            >
              <Skeleton className="size-5 rounded-md" />
              <Skeleton className="h-3 w-12" />
            </span>
          ))}
        </nav>
      </div>
    </div>
  );
}
