'use client';

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@rondo/ui/components/ui/tooltip';
import { cn } from '@rondo/ui/lib/utils';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { useTranslations } from '@/i18n/locale-context';
import { activeSection, sections } from '@/lib/sections';

export type SectionNavVariant = 'sidebar' | 'tabs';

export interface SectionNavProps {
  variant: SectionNavVariant;
  collapsed?: boolean;
}

export function SectionNav({ variant, collapsed = false }: SectionNavProps) {
  const pathname = usePathname();
  const { t } = useTranslations();

  const current = activeSection(pathname);
  const iconOnly = variant === 'sidebar' && collapsed;

  return (
    <TooltipProvider delay={500}>
      <nav
        aria-label={t('nav.sections')}
        className={cn(
          variant === 'sidebar' && 'flex flex-col gap-1',
          variant === 'sidebar' && (collapsed ? 'items-center py-2' : 'p-2'),
          variant === 'tabs' &&
            'grid shrink-0 grid-flow-col auto-cols-fr border-t bg-card px-2 pt-2 pb-6 md:hidden',
        )}
      >
        {sections.map(({ href, labelKey, Icon }) => {
          const label = t(labelKey);
          const isCurrent = current?.href === href;

          if (variant === 'tabs') {
            return (
              <Link
                key={href}
                href={href}
                aria-current={isCurrent ? 'page' : undefined}
                className={cn(
                  'flex min-h-12 flex-col items-center justify-center gap-1 text-xs leading-tight',
                  isCurrent ? 'font-medium text-foreground' : 'text-muted-foreground',
                )}
              >
                <Icon className="size-5" />
                <span>{label}</span>
              </Link>
            );
          }

          const item = (
            <Link
              key={href}
              href={href}
              aria-current={isCurrent ? 'page' : undefined}
              aria-label={iconOnly ? label : undefined}
              className={cn(
                'flex h-8 items-center gap-2 rounded-md text-sm transition-colors',
                iconOnly ? 'w-8 justify-center' : 'w-full px-2',
                isCurrent
                  ? 'bg-sidebar-foreground/10 font-medium text-sidebar-accent-foreground'
                  : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
              )}
            >
              <Icon className="size-4 shrink-0" />
              {iconOnly ? null : <span className="truncate">{label}</span>}
            </Link>
          );

          if (!iconOnly) return item;

          return (
            <Tooltip key={href}>
              <TooltipTrigger render={item} />
              <TooltipContent side="right">{label}</TooltipContent>
            </Tooltip>
          );
        })}
      </nav>
    </TooltipProvider>
  );
}
