'use client';

import { parseMoney, type BudgetViewCategoryDto } from '@rondo/types';
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from '@rondo/ui/components/ui/popover';
import { cn } from '@rondo/ui/lib/utils';

import { RollingAmount } from '@/components/rolling-amount';
import { SpendRing } from '@/components/spend-ring';
import { useTranslations } from '@/i18n/locale-context';
import { spendRing } from '@/lib/budget-month';
import type { MoneyReader } from '@/lib/money';

import type { ReactNode } from 'react';

export function CategoryTile({
  category,
  money,
  failed,
  moveOpen,
  movePanel,
  moveInPopover,
  onMoveOpen,
  onMoveClose,
}: {
  category: BudgetViewCategoryDto;
  money: MoneyReader;
  failed: boolean;
  moveOpen: boolean;
  movePanel: ReactNode;
  moveInPopover: boolean;
  onMoveOpen: () => void;
  onMoveClose: () => void;
}) {
  const { t } = useTranslations();

  const assigned = parseMoney(category.assigned);
  const activity = parseMoney(category.activity);
  const available = parseMoney(category.available);
  const ring = spendRing(activity, available);

  const card = (
    <>
      <span className="flex items-start justify-between gap-3">
        <span className="pt-0.5 text-left text-base leading-tight font-medium">
          {category.name}
        </span>
        <span className="flex shrink-0 flex-col items-end">
          <RollingAmount
            data-testid={`available-${category.name}`}
            amount={money.format(available)}
            value={available}
            className={cn(
              'text-[21px] leading-tight font-semibold tracking-tight',
              available < 0n && 'text-destructive',
              available === 0n && 'text-muted-foreground',
            )}
          />
          <span className="text-muted-foreground text-xs leading-tight">
            {t('categories.available')}
          </span>
        </span>
      </span>

      <span className="flex items-center gap-4">
        <SpendRing
          icon={category.icon}
          color={category.color}
          fraction={ring.fraction}
          overspent={ring.overspent}
        />

        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex h-8 items-center justify-between gap-2">
            <span className="text-muted-foreground text-sm md:text-xs">
              {t(ring.incoming ? 'categories.incoming' : 'categories.spent')}
            </span>
            <span
              className={cn(
                'pe-1.5 text-[15px] font-medium tabular-nums md:text-[13px]',
                activity === 0n && 'text-muted-foreground',
              )}
            >
              {money.format(ring.moved)}
            </span>
          </span>

          <span className="flex h-8 items-center justify-between gap-2">
            <span className="text-muted-foreground text-sm md:text-xs">
              {t('categories.assigned')}
            </span>
            <span
              data-testid={`assigned-${category.name}`}
              className={cn(
                'pe-1.5 text-[15px] font-medium tabular-nums md:text-[13px]',
                assigned === 0n && 'text-muted-foreground',
                assigned < 0n && 'text-destructive',
              )}
            >
              {money.format(assigned)}
            </span>
          </span>
        </span>
      </span>
    </>
  );

  const look = cn(
    'bg-card flex w-full cursor-pointer flex-col gap-3.5 rounded-[20px] p-4 text-left',
    'shadow-xs ring-1 ring-black/5 dark:ring-white/10',
    'transition-shadow duration-[120ms] hover:shadow-md',
    'aria-expanded:ring-ring/60 aria-expanded:ring-2',
    failed && 'ring-destructive/45',
  );

  if (!moveInPopover) {
    return (
      <button
        type="button"
        data-slot="category-tile"
        data-failed={failed ? 'true' : undefined}
        aria-expanded={moveOpen}
        aria-label={t('categories.moveOpen', { category: category.name })}
        onClick={onMoveOpen}
        className={look}
      >
        {card}
      </button>
    );
  }

  return (
    <Popover modal open={moveOpen} onOpenChange={(next) => (next ? onMoveOpen() : onMoveClose())}>
      <PopoverTrigger
        data-slot="category-tile"
        data-failed={failed ? 'true' : undefined}
        aria-label={t('categories.moveOpen', { category: category.name })}
        className={look}
      >
        {card}
      </PopoverTrigger>
      <PopoverContent
        backdrop
        closeLabel={t('categories.moveClose')}
        data-testid="move-dialog"
        align="start"
        sideOffset={8}
        className="w-(--anchor-width) gap-3 rounded-[20px] p-4 shadow-2xl"
      >
        <PopoverTitle className="sr-only">{category.name}</PopoverTitle>
        {movePanel}
      </PopoverContent>
    </Popover>
  );
}
