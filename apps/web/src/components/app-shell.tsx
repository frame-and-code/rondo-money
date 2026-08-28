'use client';

import { UserButton } from '@clerk/nextjs';
import { ThemeToggle } from '@rondo/ui/components/theme-toggle';
import { Button } from '@rondo/ui/components/ui/button';
import { Separator } from '@rondo/ui/components/ui/separator';
import { cn } from '@rondo/ui/lib/utils';
import { IconLayoutSidebar } from '@tabler/icons-react';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

import { LocaleSwitcher } from '@/components/locale-switcher';
import { SectionNav } from '@/components/section-nav';
import { useTranslations } from '@/i18n/locale-context';
import { activeSection, APP_NAME, documentTitle } from '@/lib/sections';

import type { ReactNode } from 'react';

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { t } = useTranslations();
  const [collapsed, setCollapsed] = useState(false);

  const current = activeSection(pathname);

  useEffect(() => {
    const wanted = documentTitle(current, (section) => t(section.labelKey));

    document.title = wanted;

    const again = requestAnimationFrame(() => {
      document.title = wanted;
    });

    return () => cancelAnimationFrame(again);
  }, [current, t]);

  return (
    <div className="flex h-dvh overflow-hidden">
      <aside
        id="app-sidebar"
        className={cn(
          'hidden shrink-0 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar md:flex',
          'transition-[width] duration-200 ease-out motion-reduce:transition-none',
          collapsed ? 'w-12' : 'w-64',
        )}
      >
        <div
          className={cn(
            'flex h-14 shrink-0 items-center gap-2 border-b border-sidebar-border',
            collapsed ? 'justify-center' : 'px-3',
          )}
        >
          <div
            aria-hidden
            className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-xs font-bold text-sidebar-primary-foreground"
          >
            R
          </div>
          {collapsed ? null : <span className="text-sm font-semibold">{APP_NAME}</span>}
        </div>
        <SectionNav variant="sidebar" collapsed={collapsed} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b px-4 md:px-6">
          <Button
            variant="ghost"
            size="icon"
            aria-label={t(collapsed ? 'nav.expandSidebar' : 'nav.toggleSidebar')}
            aria-expanded={!collapsed}
            aria-controls="app-sidebar"
            onClick={() => setCollapsed((open) => !open)}
            className="hidden aria-expanded:bg-transparent md:inline-flex"
          >
            <IconLayoutSidebar />
          </Button>
          <Separator aria-hidden orientation="vertical" className="hidden h-4 md:block" />
          <h1 className="truncate text-base font-semibold">
            {current === undefined ? null : t(current.labelKey)}
          </h1>
          <div className="flex-1" />
          <LocaleSwitcher />
          <ThemeToggle label={t('common.themeToggle.trigger')} />
          <UserButton />
        </header>

        <main className="min-h-0 flex-1 overflow-auto p-4 [scrollbar-gutter:stable] md:p-6">
          {children}
        </main>

        <SectionNav variant="tabs" />
      </div>
    </div>
  );
}
