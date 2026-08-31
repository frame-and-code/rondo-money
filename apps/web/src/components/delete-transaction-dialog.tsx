'use client';

import { parseMoney, type TransactionDto } from '@rondo/types';
import { Alert, AlertDescription, AlertTitle } from '@rondo/ui/components/ui/alert';
import { Button } from '@rondo/ui/components/ui/button';
import { IconAlertCircle } from '@tabler/icons-react';
import { useEffect, useState, type ReactNode } from 'react';

import { useTranslations } from '@/i18n/locale-context';
import type { MessageKey } from '@/i18n/messages';
import type { MoneyReader } from '@/lib/money';

export function DeleteTransactionDialog({
  record,
  money,
  accountName,
  categoryName,
  failed,
  busy,
  onDelete,
  onCancel,
}: {
  record: TransactionDto;
  money: MoneyReader;
  accountName: (id: string) => string | null;
  categoryName: (id: string) => string | null;
  failed: MessageKey | null;
  busy: boolean;
  onDelete: () => void;
  onCancel: () => void;
}): ReactNode {
  const { t } = useTranslations();
  const [asked, setAsked] = useState(false);

  useEffect(() => {
    if (!busy) setAsked(false);
  }, [busy]);

  const amount = parseMoney(record.amount);
  const spending = amount < 0n;
  const back = -amount;

  const press = (): void => {
    if (busy || asked) return;

    setAsked(true);
    onDelete();
  };

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">
        {t('transactions.deleteTitle', {
          payee: record.payee ?? t('transactions.noPayee'),
          amount: money.format(amount),
        })}
      </h2>

      <ul className="text-muted-foreground flex flex-col gap-1 text-sm">
        <li data-testid="delete-account-line">
          {t('transactions.deleteAccountLine', {
            name: accountName(record.accountId) ?? '',
            amount: money.format(back),
          })}
        </li>
        {record.categoryId === null ? (
          <li data-testid="delete-pool-line">
            {t('transactions.deletePoolLine', { amount: money.format(back) })}
          </li>
        ) : (
          <li data-testid="delete-category-line">
            {t('transactions.deleteCategoryLine', {
              name: categoryName(record.categoryId) ?? '',
              amount: money.format(back),
            })}
          </li>
        )}
      </ul>

      {failed === null ? null : (
        <Alert variant="destructive">
          <IconAlertCircle />
          <AlertTitle>
            {t(spending ? 'transactions.failTitleExpense' : 'transactions.failTitleIncome')}
          </AlertTitle>
          <AlertDescription>{t(failed)}</AlertDescription>
        </Alert>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" className="rounded-2xl" onClick={onCancel}>
          {t('transactions.cancel')}
        </Button>
        <Button
          type="button"
          variant="destructive"
          className="rounded-2xl"
          disabled={busy || asked}
          onClick={press}
        >
          {t('transactions.delete')}
        </Button>
      </div>
    </div>
  );
}
