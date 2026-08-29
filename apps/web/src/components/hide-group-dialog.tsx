'use client';

import { Button } from '@rondo/ui/components/ui/button';
import { cn } from '@rondo/ui/lib/utils';
import { IconCircleCheck, IconCircleX } from '@tabler/icons-react';

import { useTranslations } from '@/i18n/locale-context';
import type { MessageKey } from '@/i18n/messages';
import type { MoneyReader } from '@/lib/money';

export function HideGroupDialog({
  group,
  money,
  failed,
  busy = false,
  onMoveOut,
  onHide,
  onCancel,
}: {
  group: {
    id: string;
    name: string;
    categories: { id: string; name: string; availableAllTime: bigint }[];
  };
  money: MoneyReader;
  failed: MessageKey | null;
  busy?: boolean;
  onMoveOut: (categoryId: string) => void;
  onHide: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslations();

  const holding = group.categories.filter((one) => one.availableAllTime !== 0n);

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div className="flex flex-col gap-1.5 pe-10">
        <h2 className="text-base leading-tight font-medium">
          {t('categories.hideGroupTitle', { group: group.name })}
        </h2>
        <p className="text-muted-foreground text-sm">{t('categories.hideGroupBody')}</p>
      </div>

      <ul className="flex min-w-0 flex-col gap-1.5">
        {group.categories.map((one) => {
          const blocks = one.availableAllTime !== 0n;

          return (
            <li
              key={one.id}
              className={cn(
                'flex min-w-0 flex-col gap-2 rounded-2xl px-3 py-2.5',
                blocks ? 'bg-muted ring-foreground/8 ring-1' : 'bg-muted/40',
              )}
            >
              <span className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2">
                  {blocks ? (
                    <IconCircleX
                      aria-hidden
                      data-testid={`group-status-${one.id}`}
                      data-state="blocked"
                      className="text-destructive size-[18px] shrink-0"
                    />
                  ) : (
                    <IconCircleCheck
                      aria-hidden
                      data-testid={`group-status-${one.id}`}
                      data-state="ok"
                      className="size-[18px] shrink-0 text-[var(--cat-emerald)]"
                    />
                  )}
                  <span
                    className={cn(
                      'min-w-0 truncate text-sm',
                      blocks ? 'font-medium' : 'text-muted-foreground',
                    )}
                  >
                    {one.name}
                  </span>
                </span>
                <span
                  data-testid={`group-hide-${one.id}`}
                  className={cn(
                    'shrink-0 text-[15px] font-medium tabular-nums',
                    one.availableAllTime < 0n && 'text-destructive',
                    one.availableAllTime === 0n && 'text-muted-foreground',
                  )}
                >
                  {money.format(one.availableAllTime)}
                </span>
              </span>

              {blocks ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  className="w-full sm:ms-auto sm:w-auto"
                  onClick={() => onMoveOut(one.id)}
                >
                  {t('categories.release')}
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>

      <p className="text-muted-foreground text-sm">
        {holding.length > 0
          ? t('categories.hideGroupBlocked')
          : t('categories.hideTransactionWarning')}
      </p>

      {failed === null ? null : (
        <p role="alert" className="text-destructive text-sm">
          {t(failed)}
        </p>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          {t('categories.cancel')}
        </Button>
        <Button type="button" disabled={holding.length > 0 || busy} onClick={onHide}>
          {t('categories.hide')}
        </Button>
      </div>
    </div>
  );
}
