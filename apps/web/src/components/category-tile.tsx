'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { parseMoney, type BudgetViewCategoryDto } from '@rondo/types';
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from '@rondo/ui/components/ui/popover';
import { cn } from '@rondo/ui/lib/utils';
import { IconGripVertical } from '@tabler/icons-react';

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
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: category.id,
  });

  const handle = (
    <button
      type="button"
      data-testid={`reorder-${category.name}`}
      aria-label={t('categories.reorder', { category: category.name })}
      className="text-muted-foreground/35 hover:text-muted-foreground hover:bg-muted/60 absolute inset-y-1 right-1 flex w-7 cursor-grab items-center justify-center rounded-2xl transition-colors duration-[120ms]"
      {...attributes}
      {...listeners}
    >
      <IconGripVertical aria-hidden className="size-4" />
    </button>
  );

  const assigned = parseMoney(category.assigned);
  const activity = parseMoney(category.activity);
  const available = parseMoney(category.available);
  const ring = spendRing(activity, available);

  const card = (
    <>
      <span className="flex items-start justify-between gap-3">
        <span
          data-testid="category-name"
          className="pt-0.5 text-left text-base leading-tight font-medium"
        >
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
                'text-[15px] font-medium tabular-nums md:text-[13px]',
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
                'text-[15px] font-medium tabular-nums md:text-[13px]',
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
    'bg-card flex h-full w-full cursor-pointer flex-col gap-3.5 rounded-[20px] p-4 pe-11 text-left',
    'shadow-xs ring-1 ring-black/5 dark:ring-white/10',
    'transition-shadow duration-[120ms] hover:shadow-md',
    'aria-expanded:ring-ring/60 aria-expanded:ring-2',
    failed && 'ring-destructive/45',
  );

  const frame = {
    ref: setNodeRef,
    style: { transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 1 : 0 },
    className: 'relative h-full',
  };

  const grab = { ...listeners };

  if (!moveInPopover) {
    return (
      <div {...frame}>
        <button
          type="button"
          data-slot="category-tile"
          data-failed={failed ? 'true' : undefined}
          aria-expanded={moveOpen}
          aria-label={t('categories.moveOpen', { category: category.name })}
          onClick={onMoveOpen}
          className={look}
          {...grab}
        >
          {card}
        </button>
        {handle}
      </div>
    );
  }

  return (
    <Popover modal open={moveOpen} onOpenChange={(next) => (next ? onMoveOpen() : onMoveClose())}>
      <div {...frame}>
        <PopoverTrigger
          data-slot="category-tile"
          data-failed={failed ? 'true' : undefined}
          aria-label={t('categories.moveOpen', { category: category.name })}
          className={look}
          {...grab}
        >
          {card}
        </PopoverTrigger>
        {handle}
      </div>
      <PopoverContent
        backdrop
        collisionAvoidance={{ side: 'shift', align: 'shift', fallbackAxisSide: 'none' }}
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
