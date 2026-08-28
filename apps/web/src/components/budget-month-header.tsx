'use client';

import { nextCalendarMonth, previousCalendarMonth } from '@rondo/types';
import type { CalendarMonth } from '@rondo/types';
import { Button } from '@rondo/ui/components/ui/button';
import { useIsMobile } from '@rondo/ui/hooks/use-mobile';
import { cn } from '@rondo/ui/lib/utils';
import { IconCalendar, IconChevronLeft, IconChevronRight, IconLoader } from '@tabler/icons-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { RollingAmount } from '@/components/rolling-amount';
import { useTranslations } from '@/i18n/locale-context';
import { monthLabel } from '@/lib/budget-month';
import type { MoneyReader } from '@/lib/money';

const RESTING = cn(
  'mb-5 flex flex-col gap-3',
  'md:bg-card md:flex-row md:flex-wrap md:items-center md:justify-between md:gap-6',
  'md:rounded-3xl md:px-6 md:py-5 md:shadow-xs md:ring-1 md:ring-black/5',
  'md:dark:ring-white/10',
);

const ISLAND_SHAPE = cn(
  'mx-auto flex w-2/3 min-w-2/3 flex-col items-center justify-center rounded-full px-6 py-2',
  'md:flex-row md:justify-between md:gap-4 md:py-1.5 md:pr-1.5 md:pl-1.5',
  'ring-2 ring-neutral-300/85 dark:ring-neutral-800',
  'shadow-[0_10px_32px_-10px_rgba(0,0,0,0.28)] dark:shadow-[0_10px_32px_-10px_rgba(0,0,0,0.55)]',
);

const ISLAND = cn(
  ISLAND_SHAPE,
  'bg-neutral-100/32 backdrop-blur-2xl backdrop-saturate-200 dark:bg-neutral-900/32',
);

const ISLAND_OVER_SHEET = cn(ISLAND_SHAPE, 'bg-background');

const RESTING_AMOUNT = cn(
  'bg-card order-2 flex flex-col items-center gap-0.5 rounded-3xl px-6 py-5 shadow-xs',
  'ring-1 ring-black/5 dark:ring-white/10',
  'md:order-1 md:items-start md:rounded-none md:bg-transparent md:p-0 md:shadow-none',
  'md:ring-0 md:dark:ring-0',
);

export function BudgetMonthHeader({
  month,
  stepping,
  floating,
  today,
  first,
  readyToAssign,
  money,
  onMonth,
}: {
  month: CalendarMonth;
  stepping: 'forward' | 'back' | null;
  floating: boolean;
  today: CalendarMonth;
  first: CalendarMonth;
  readyToAssign: bigint;
  money: MoneyReader;
  onMonth: (next: CalendarMonth) => void;
}) {
  const { t, locale } = useTranslations();
  const mark = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);
  const isMobile = useIsMobile();
  const amount = useRef<HTMLSpanElement>(null);
  const wasAt = useRef<number | null>(null);

  useLayoutEffect(() => {
    const node = amount.current;
    if (node === null || typeof node.animate !== 'function') return;

    const at = node.getBoundingClientRect().left;
    const before = wasAt.current;
    wasAt.current = at;

    if (before === null || before === at) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    node.animate([{ transform: `translateX(${before - at}px)` }, { transform: 'translateX(0)' }], {
      duration: 220,
      easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
    });
  });

  const island = scrolled || floating;
  const switcherInIsland = island && !isMobile && !floating;

  useEffect(() => {
    const sentinel = mark.current;
    if (sentinel === null || typeof IntersectionObserver === 'undefined') return;

    const watch = new IntersectionObserver(
      ([entry]) => setScrolled(entry !== undefined && !entry.isIntersecting),
      { root: sentinel.closest('main'), threshold: 1 },
    );

    watch.observe(sentinel);

    return () => watch.disconnect();
  }, []);

  const [stepped, setStepped] = useState<{ month: CalendarMonth; forward: boolean }>({
    month,
    forward: true,
  });

  if (stepped.month !== month) {
    setStepped((current) =>
      current.month === month ? current : { month, forward: month > current.month },
    );
  }

  const hint =
    readyToAssign > 0n
      ? 'categories.readyToAssignFree'
      : readyToAssign < 0n
        ? 'categories.readyToAssignOver'
        : 'categories.readyToAssignDone';

  const todayButton =
    month === today ? null : (
      <Button
        type="button"
        variant="ghost"
        className="h-8 md:order-2"
        onClick={() => onMonth(today)}
      >
        {t('categories.today')}
      </Button>
    );

  const switcher = (
    <div className="bg-muted order-1 flex items-center gap-0.5 rounded-2xl p-0.5 md:order-3">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-8"
        aria-label={t('categories.previousMonth')}
        disabled={month <= first || stepping !== null}
        onClick={() => onMonth(previousCalendarMonth(month))}
      >
        {stepping === 'back' ? (
          <IconLoader className="size-[18px] animate-spin" />
        ) : (
          <IconChevronLeft className="size-[18px]" />
        )}
      </Button>
      <span className="min-w-38 overflow-hidden text-center text-[15px] font-medium">
        <span
          key={month}
          className={cn(
            'block',
            stepped.forward
              ? 'motion-safe:animate-slide-in-right'
              : 'motion-safe:animate-slide-in-left',
          )}
        >
          {monthLabel(month, locale)}
        </span>
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-8"
        aria-label={t('categories.nextMonth')}
        disabled={stepping !== null}
        onClick={() => onMonth(nextCalendarMonth(month))}
      >
        {stepping === 'forward' ? (
          <IconLoader className="size-[18px] animate-spin" />
        ) : (
          <IconChevronRight className="size-[18px]" />
        )}
      </Button>
    </div>
  );

  return (
    <>
      <div ref={mark} aria-hidden className="h-px" />

      <div className={cn('sticky top-0 h-0', floating ? 'z-[60]' : 'z-20')}>
        <div
          className={cn(
            'absolute inset-x-0 top-2 transition-opacity duration-200 ease-out',
            'motion-reduce:transition-none',
            island ? 'opacity-100' : 'pointer-events-none opacity-0',
          )}
        >
          <div
            data-testid="ready-to-assign-island"
            className={floating ? ISLAND_OVER_SHEET : ISLAND}
          >
            {switcherInIsland ? todayButton : null}
            <span
              ref={amount}
              aria-hidden
              className="flex flex-col items-center leading-none md:flex-1 md:items-center"
            >
              <span className="text-muted-foreground text-xs">{t('categories.readyToAssign')}</span>
              <RollingAmount
                data-testid="ready-to-assign-island-amount"
                amount={money.format(readyToAssign)}
                value={readyToAssign}
                className={cn(
                  'text-base leading-none font-semibold tracking-tight',
                  readyToAssign > 0n && 'text-primary dark:text-chart-2',
                  readyToAssign < 0n && 'text-destructive',
                )}
              />
            </span>
            {switcherInIsland ? switcher : null}
          </div>
        </div>
      </div>

      <div className={RESTING}>
        <div
          className={cn('order-1 flex flex-col items-center gap-2 md:order-2 md:flex-row md:gap-2')}
        >
          {switcherInIsland ? null : switcher}

          <div className="order-2 flex items-center justify-center gap-2 md:contents">
            {month > today ? (
              <span
                className={cn(
                  'bg-primary/10 text-primary inline-flex h-7 items-center gap-1.5 rounded-2xl',
                  'px-3 text-xs font-medium md:order-1',
                )}
              >
                <IconCalendar aria-hidden className="size-3.5" />
                {t('categories.futureMonth')}
              </span>
            ) : null}

            {switcherInIsland ? null : todayButton}
          </div>
        </div>

        <div className={RESTING_AMOUNT}>
          <span className="text-muted-foreground text-[13px]">{t('categories.readyToAssign')}</span>
          <RollingAmount
            data-testid="ready-to-assign"
            amount={money.format(readyToAssign)}
            value={readyToAssign}
            className={cn(
              'text-[38px] leading-[1.1] font-semibold tracking-tight',
              readyToAssign > 0n && 'text-primary dark:text-chart-2',
              readyToAssign < 0n && 'text-destructive',
            )}
          />
          <span
            className={cn(
              'text-[13px]',
              readyToAssign < 0n ? 'text-destructive' : 'text-muted-foreground',
            )}
          >
            {t(hint)}
          </span>
        </div>
      </div>
    </>
  );
}
