'use client';

import { parseMoney, type TransactionDto } from '@rondo/types';
import { Button } from '@rondo/ui/components/ui/button';
import { useEffect, useState, type ReactNode } from 'react';

import { FailureAlert } from '@/components/failure-alert';
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
  const moved = amount < 0n ? -amount : amount;
  const shown = money.format(moved);
  const transfer = record.transferId !== null;
  const counter = record.counterAccountId ?? '';
  const returnedTo = spending ? record.accountId : counter;
  const takenFrom = spending ? counter : record.accountId;

  const press = (): void => {
    if (busy || asked) return;

    setAsked(true);
    onDelete();
  };

  const landed = accountName(transfer ? returnedTo : record.accountId);
  const left = accountName(takenFrom);

  const title = (): string => {
    if (transfer) return t('transactions.deleteTransferTitle', { amount: shown });
    if (record.type === 'ADJUSTMENT') {
      return t('transactions.deleteAdjustmentTitle', { amount: shown });
    }
    if (record.payee === null) {
      return t(spending ? 'transactions.deleteExpenseTitle' : 'transactions.deleteIncomeTitle', {
        amount: shown,
      });
    }

    return t('transactions.deleteTitle', { payee: record.payee, amount: shown });
  };

  const accountLine = (): string => {
    if (transfer) {
      return landed === null
        ? t('transactions.deleteArchivedLine', { amount: shown })
        : t('transactions.deleteTransferLine', { name: landed, amount: shown });
    }
    if (landed === null) {
      return t(
        spending ? 'transactions.deleteArchivedLine' : 'transactions.deleteArchivedCounterLine',
        { amount: shown },
      );
    }

    return t(spending ? 'transactions.deleteAccountLine' : 'transactions.deleteAccountTakenLine', {
      name: landed,
      amount: shown,
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">{title()}</h2>

      <ul className="text-muted-foreground flex flex-col gap-1 text-sm">
        <li data-testid="delete-account-line">{accountLine()}</li>
        {transfer ? (
          <li data-testid="delete-counter-line">
            {left === null
              ? t('transactions.deleteArchivedCounterLine', { amount: shown })
              : t('transactions.deleteTransferCounterLine', { name: left, amount: shown })}
          </li>
        ) : record.categoryId === null ? (
          <li data-testid="delete-pool-line">
            {t(spending ? 'transactions.deletePoolLine' : 'transactions.deletePoolTakenLine', {
              amount: shown,
            })}
          </li>
        ) : (
          <li data-testid="delete-category-line">
            {t(
              spending ? 'transactions.deleteCategoryLine' : 'transactions.deleteCategoryTakenLine',
              { name: categoryName(record.categoryId) ?? '', amount: shown },
            )}
          </li>
        )}
      </ul>

      {failed === null ? null : <FailureAlert>{t(failed)}</FailureAlert>}

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
