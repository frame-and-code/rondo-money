'use client';

import { buttonVariants } from '@rondo/ui/components/ui/button';
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
            'grid shrink-0 grid-flow-col auto-cols-fr border-t bg-card px-2 pt-1.5 pb-[calc(0.5rem+env(safe-area-inset-bottom))] md:hidden',
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
                  buttonVariants({ variant: 'ghost' }),
                  'h-auto min-h-11 flex-col justify-start gap-0.5 rounded-md px-0 text-xs leading-tight whitespace-normal',
                  'hover:bg-transparent active:not-aria-[haspopup]:translate-y-0 dark:hover:bg-transparent',
                  isCurrent
                    ? 'text-foreground hover:text-foreground font-medium'
                    : 'text-muted-foreground hover:text-muted-foreground font-normal',
                )}
              >
                <span className="flex h-5 items-center">
                  <Icon className="size-5" />
                </span>
                <span className="text-center text-balance">{label}</span>
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
                buttonVariants({ variant: 'ghost', size: iconOnly ? 'icon' : 'default' }),
                'gap-2 rounded-md',
                iconOnly ? null : 'w-full justify-start px-2',
                isCurrent
                  ? 'bg-sidebar-foreground/10 hover:bg-sidebar-foreground/10 dark:hover:bg-sidebar-foreground/10 text-sidebar-accent-foreground font-medium'
                  : 'text-sidebar-foreground hover:bg-sidebar-accent dark:hover:bg-sidebar-accent hover:text-sidebar-accent-foreground font-normal',
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
