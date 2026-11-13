'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { parseMoney, type BudgetViewCategoryDto } from '@rondo/types';
import { Button } from '@rondo/ui/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from '@rondo/ui/components/ui/popover';
import { useIsMobile } from '@rondo/ui/hooks/use-mobile';
import { cn } from '@rondo/ui/lib/utils';
import { IconCheck, IconGripVertical } from '@tabler/icons-react';
import { useId, useState, type ReactNode } from 'react';

import { RollingAmount } from '@/components/rolling-amount';
import { SpendRing } from '@/components/spend-ring';
import { TargetBadge } from '@/components/target-badge';
import { TargetPanel } from '@/components/target-panel';
import { useTranslations } from '@/i18n/locale-context';
import { categoryRing } from '@/lib/budget-month';
import type { MoneyReader } from '@/lib/money';

export function CategoryTile({
  category,
  money,
  failed,
  attention = false,
  sortable = true,
  moveOpen,
  movePanel,
  moveInPopover,
  onMoveOpen,
  onMoveClose,
}: {
  category: BudgetViewCategoryDto;
  money: MoneyReader;
  failed: boolean;
  attention?: boolean;
  sortable?: boolean;
  moveOpen: boolean;
  movePanel: ReactNode;
  moveInPopover: boolean;
  onMoveOpen: () => void;
  onMoveClose: () => void;
}) {
  const { t } = useTranslations();
  const isMobile = useIsMobile();
  const [explaining, setExplaining] = useState(false);
  const spoken = useId();
  const closed = useId();
  const hint = useId();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: category.id,
    disabled: !sortable ? true : category.paid || moveOpen ? { draggable: true } : false,
  });

  const handle =
    !sortable || category.paid ? null : (
      <Button
        variant="ghost"
        size="icon-sm"
        data-testid={`reorder-${category.name}`}
        aria-label={t('categories.reorder', { category: category.name })}
        className="text-muted-foreground/35 hover:text-muted-foreground hover:bg-muted/60 absolute inset-y-1 right-1 h-auto cursor-grab duration-[120ms]"
        {...attributes}
        {...listeners}
      >
        <IconGripVertical aria-hidden />
      </Button>
    );

  const assigned = parseMoney(category.assigned);
  const activity = parseMoney(category.activity);
  const available = parseMoney(category.available);
  const ring = categoryRing(category);
  const target = category.target ?? null;
  const monthTarget = target?.monthTarget === undefined ? null : parseMoney(target.monthTarget);
  const needed = target?.needed === undefined ? null : parseMoney(target.needed);
  const monthly = monthTarget !== null && needed !== null;
  const laid = monthTarget !== null && needed !== null ? monthTarget - needed : assigned;

  const disc = (
    <SpendRing
      icon={category.icon}
      color={category.color}
      fill={ring.fill}
      head={ring.head}
      goalShare={ring.goalShare}
      overspent={ring.overspent}
      size={isMobile ? 56 : 72}
    />
  );

  const described = [hint, category.paid ? closed : null, target === null ? null : spoken]
    .filter(Boolean)
    .join(' ');

  const moveHint = (
    <>
      <span id={hint} hidden>
        {t('categories.moveOpen', { category: category.name })}
      </span>
      {category.paid ? (
        <span id={closed} hidden>
          {t('categories.paidMark')}
        </span>
      ) : null}
      {target === null ? null : (
        <span id={spoken} hidden>
          <TargetPanel spoken target={target} money={money} color={category.color} />
        </span>
      )}
    </>
  );

  const row = cn(
    'flex flex-col items-start justify-center gap-x-2',
    '@xs:min-h-8 @xs:flex-row @xs:items-center @xs:justify-between',
  );
  const rowLabel = 'text-muted-foreground max-w-full min-w-0 truncate text-xs leading-tight';

  const card = (
    <>
      <span className="flex items-start justify-between gap-3">
        <span className="flex min-w-0 items-start gap-1.5 pt-0.5">
          {category.paid ? (
            <span
              data-testid="paid-mark"
              className={cn(
                'text-success mt-0.5 inline-flex size-4 shrink-0 items-center justify-center',
                'rounded-full border-[1.5px] border-current',
              )}
            >
              <IconCheck aria-hidden className="size-2.5" stroke={3.5} />
            </span>
          ) : null}
          <span
            data-testid="category-name"
            className="min-w-0 text-left text-[15px] leading-tight font-medium wrap-break-word md:text-base"
          >
            {category.name}
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end">
          <RollingAmount
            data-testid={`available-${category.name}`}
            amount={money.format(available)}
            value={available}
            className={cn(
              'text-lg leading-tight font-semibold tracking-tight md:text-[21px]',
              available < 0n && 'text-destructive',
              available === 0n && 'text-muted-foreground',
            )}
          />
          <span className="text-muted-foreground text-xs leading-tight">
            {t('categories.available')}
          </span>
        </span>
      </span>

      <span data-slot="tile-figures" className="mt-auto flex items-center gap-3 md:gap-4">
        {target === null || !moveInPopover ? (
          disc
        ) : (
          <Popover open={explaining} onOpenChange={setExplaining}>
            <PopoverTrigger
              render={<span />}
              nativeButton={false}
              data-testid="target-hover"
              aria-label={t('categories.goalExplain', { category: category.name })}
              onClick={(event) => event.stopPropagation()}
              openOnHover
              disabled={moveOpen}
              delay={0}
              closeDelay={0}
            >
              {disc}
            </PopoverTrigger>
            <PopoverContent
              arrow
              side="top"
              align="center"
              sideOffset={10}
              className="bg-card dark:bg-background w-72 rounded-2xl border p-3.5 shadow-2xl"
            >
              <PopoverTitle className="sr-only">{category.name}</PopoverTitle>
              <TargetPanel target={target} money={money} color={category.color} />
            </PopoverContent>
          </Popover>
        )}

        <span className="@container flex min-w-0 flex-1 flex-col gap-0.5">
          <span className={row}>
            <span className={rowLabel}>
              {t(ring.incoming ? 'categories.incoming' : 'categories.spent')}
            </span>
            <span
              data-testid={`spent-${category.name}`}
              className={cn(
                'shrink-0 text-[13px] leading-tight font-medium whitespace-nowrap tabular-nums',
                activity === 0n && 'text-muted-foreground',
              )}
            >
              {money.format(ring.moved)}
            </span>
          </span>

          <span className={row}>
            <span className={rowLabel}>
              {t(monthly ? 'categories.goalMonthlyTarget' : 'categories.assigned')}
            </span>
            <span
              data-testid={`assigned-${category.name}`}
              className={cn(
                'inline-flex max-w-full shrink-0 flex-col items-start whitespace-nowrap',
                '@xs:flex-row @xs:items-center',
                'text-[13px] leading-tight font-medium tabular-nums',
                !monthly && laid === 0n && 'text-muted-foreground',
                laid < 0n && 'text-destructive',
              )}
            >
              {monthly ? (
                <>
                  <span className="inline-flex items-center">
                    <TargetBadge needed={needed} money={money} />
                    <span className="font-semibold">{money.pairStart(laid)}</span>
                  </span>
                  <span className="inline-flex">
                    <span className="text-muted-foreground">{' / '}</span>
                    <span className="text-muted-foreground font-normal">
                      {money.format(monthTarget)}
                    </span>
                  </span>
                </>
              ) : (
                money.format(assigned)
              )}
            </span>
          </span>
        </span>
      </span>
    </>
  );

  const look = cn(
    'bg-card flex h-full w-full cursor-pointer flex-col gap-3.5 rounded-[20px] p-4 pe-11 text-left',
    'shadow-xs ring-1 ring-border',
    'transition-shadow duration-[120ms] hover:shadow-md hover:shadow-primary/15',
    'hover:ring-primary dark:hover:ring-primary/35',
    'aria-expanded:ring-primary dark:aria-expanded:ring-primary/60 aria-expanded:ring-2 aria-expanded:shadow-md',
    'aria-expanded:shadow-primary/15',
    'focus-visible:ring-ring/60 outline-none focus-visible:ring-2',
    attention && 'ring-warning dark:ring-warning/45 ring-2',
    failed && 'ring-destructive dark:ring-destructive/45',
  );

  const frame = {
    ref: setNodeRef,
    'data-testid': `category-tile-${category.name}`,
    'data-category-id': category.id,
    'data-paid': category.paid ? 'true' : undefined,
    style: {
      transform: CSS.Translate.toString(transform),
      transition,
      zIndex: isDragging ? 1 : moveOpen && moveInPopover ? 45 : undefined,
    },
    className: cn(
      'relative h-full',
      category.paid &&
        'opacity-55 transition-opacity duration-[120ms] hover:opacity-100 focus-within:opacity-100 has-aria-expanded:opacity-100',
    ),
  };

  const { onKeyDown: _startsByKeyboard, ...byPointer } = listeners ?? {};

  const grab = byPointer;

  if (!moveInPopover) {
    return (
      <div {...frame}>
        <Button
          variant="ghost"
          data-slot="category-tile"
          data-failed={failed ? 'true' : undefined}
          aria-expanded={moveOpen}
          aria-describedby={described}
          onClick={onMoveOpen}
          className={cn(
            look,
            'h-full items-stretch justify-start font-normal whitespace-normal',
            'hover:bg-card dark:hover:bg-card aria-expanded:bg-card active:not-aria-[haspopup]:translate-y-0',
            "[&_svg:not([class*='size-'])]:size-auto",
          )}
          {...grab}
        >
          {card}
        </Button>
        {handle}
        {moveHint}
      </div>
    );
  }

  return (
    <Popover modal open={moveOpen} onOpenChange={(next) => (next ? onMoveOpen() : onMoveClose())}>
      <div {...frame}>
        <PopoverTrigger
          data-slot="category-tile"
          data-failed={failed ? 'true' : undefined}
          aria-describedby={described}
          className={look}
          {...grab}
        >
          {card}
        </PopoverTrigger>
        {handle}
        {moveHint}
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
