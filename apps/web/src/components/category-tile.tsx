'use client';

import { parseMoney, type BudgetViewCategoryDto } from '@rondo/types';
import { cn } from '@rondo/ui/lib/utils';

import { AssignField } from '@/components/assign-field';
import { RollingAmount } from '@/components/rolling-amount';
import { SpendRing } from '@/components/spend-ring';
import { useTranslations } from '@/i18n/locale-context';
import { spendRing } from '@/lib/budget-month';
import type { MoneyReader } from '@/lib/money';

export function CategoryTile({
  category,
  money,
  editing,
  draft,
  saving,
  failed,
  onOpen,
  onDraft,
  onCommit,
  onCancel,
}: {
  category: BudgetViewCategoryDto;
  money: MoneyReader;
  editing: boolean;
  draft: string;
  saving: boolean;
  failed: boolean;
  onOpen: () => void;
  onDraft: (value: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslations();

  const assigned = parseMoney(category.assigned);
  const activity = parseMoney(category.activity);
  const available = parseMoney(category.available);
  const ring = spendRing(activity, available);

  return (
    <div
      data-slot="category-tile"
      data-failed={failed ? 'true' : undefined}
      className={cn(
        'bg-card flex flex-col gap-3.5 rounded-[20px] p-4 shadow-xs ring-1 ring-black/5',
        'dark:ring-white/10',
        failed && 'ring-destructive/45',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="pt-0.5 text-base leading-tight font-medium">{category.name}</span>
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
      </div>

      <div className="flex items-center gap-4">
        <SpendRing
          icon={category.icon}
          color={category.color}
          fraction={ring.fraction}
          overspent={ring.overspent}
        />

        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
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
            <AssignField
              category={category.name}
              assigned={assigned}
              money={money}
              editing={editing}
              draft={draft}
              saving={saving}
              failed={failed}
              onOpen={onOpen}
              onDraft={onDraft}
              onCommit={onCommit}
              onCancel={onCancel}
            />
          </span>
        </div>
      </div>
    </div>
  );
}
