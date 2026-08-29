'use client';

import { Button } from '@rondo/ui/components/ui/button';
import { cn } from '@rondo/ui/lib/utils';
import { IconAlertTriangle } from '@tabler/icons-react';

import { useTranslations } from '@/i18n/locale-context';
import type { MessageKey } from '@/i18n/messages';
import type { MoneyReader } from '@/lib/money';

function Line({
  label,
  amount,
  value,
  testId,
  strong,
}: {
  label: string;
  amount: string;
  value: bigint;
  testId: string;
  strong?: boolean;
}) {
  return (
    <span className="flex items-baseline justify-between gap-3">
      <span className="text-muted-foreground text-sm">{label}</span>
      <span
        data-testid={testId}
        className={cn(
          'text-[15px] tabular-nums',
          strong ? 'font-semibold' : 'font-medium',
          value < 0n && 'text-destructive',
          value === 0n && 'text-muted-foreground',
        )}
      >
        {amount}
      </span>
    </span>
  );
}

export function HideCategoryDialog({
  category,
  money,
  failed,
  busy = false,
  onMoveOut,
  onHide,
  onCancel,
}: {
  category: { id: string; name: string; available: bigint; availableAllTime: bigint };
  money: MoneyReader;
  failed: MessageKey | null;
  busy?: boolean;
  onMoveOut: () => void;
  onHide: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslations();

  const later = category.availableAllTime - category.available;
  const holdsMoney = category.availableAllTime !== 0n;

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div className="flex flex-col gap-1.5 pe-10">
        <h2 className="text-base leading-tight font-medium">
          {t('categories.hideTitle', { category: category.name })}
        </h2>
        <p className="text-muted-foreground text-sm">{t('categories.hideTransactionWarning')}</p>
      </div>

      <div
        className={cn(
          'flex flex-col gap-1.5 rounded-[18px] p-4',
          holdsMoney ? 'bg-muted ring-foreground/8 ring-1' : 'bg-muted/50',
        )}
      >
        <Line
          label={t('categories.hideThisMonth')}
          amount={money.format(category.available)}
          value={category.available}
          testId="hide-this-month"
        />
        <Line
          label={t('categories.hideFutureMonths')}
          amount={money.format(later)}
          value={later}
          testId="hide-future"
        />
        <div aria-hidden className="bg-border/70 my-1 h-px w-full" />
        <Line
          label={t('categories.hideTotal')}
          amount={money.format(category.availableAllTime)}
          value={category.availableAllTime}
          testId="hide-total"
          strong
        />
      </div>

      {holdsMoney ? (
        <p className="text-muted-foreground flex items-start gap-2 text-sm">
          <IconAlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
          {t('categories.hideBlocked')}
        </p>
      ) : null}

      {failed === null ? null : (
        <p role="alert" className="text-destructive text-sm">
          {t(failed)}
        </p>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          {t('categories.cancel')}
        </Button>
        {holdsMoney ? (
          <Button type="button" variant="secondary" disabled={busy} onClick={onMoveOut}>
            {t('categories.release')}
          </Button>
        ) : null}
        <Button type="button" disabled={holdsMoney || busy} onClick={onHide}>
          {t('categories.hide')}
        </Button>
      </div>
    </div>
  );
}
