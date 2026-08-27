'use client';

import { cn } from '@rondo/ui/lib/utils';
import { IconChevronDown } from '@tabler/icons-react';
import { useId, useState, type ReactNode } from 'react';

import { useTranslations } from '@/i18n/locale-context';

export function CategoryGroup({
  id,
  name,
  available,
  children,
}: {
  id: string;
  name: string;
  available: string;
  children: ReactNode;
}) {
  const { t } = useTranslations();
  const [open, setOpen] = useState(true);
  const body = useId();

  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={body}
          aria-label={t('categories.groupToggle', { group: name })}
          onClick={() => setOpen((shown) => !shown)}
          className="group/fold flex h-[30px] items-center gap-1.5 text-[15px] font-semibold"
        >
          <IconChevronDown
            aria-hidden
            className={cn(
              'text-muted-foreground size-4 transition-transform duration-200',
              'motion-reduce:transition-none',
              open ? 'rotate-0' : '-rotate-90',
            )}
          />
          <span
            className={cn(
              'rounded-[10px] px-2 py-0.5 transition-colors duration-[120ms]',
              'group-hover/fold:bg-muted',
            )}
          >
            {name}
          </span>
        </button>
        <div aria-hidden className="h-px flex-1 bg-black/6 dark:bg-white/10" />
        <span className="flex items-baseline gap-1.5">
          <span className="text-muted-foreground text-xs">{t('categories.available')}</span>
          <span
            data-testid={`group-total-${id}`}
            className="text-[15px] font-semibold tabular-nums"
          >
            {available}
          </span>
        </span>
      </div>

      <div
        id={body}
        aria-hidden={!open}
        className={cn(
          'grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none',
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
        )}
      >
        <div
          inert={!open}
          className={cn(
            'overflow-hidden transition-opacity duration-200 ease-out',
            'motion-reduce:transition-none',
            open ? 'opacity-100' : 'opacity-0',
          )}
        >
          <div className="grid gap-4 px-1 py-1 md:grid-cols-2 xl:grid-cols-3">{children}</div>
        </div>
      </div>
    </section>
  );
}
