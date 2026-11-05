'use client';

import {
  accountsControllerListOptions,
  budgetViewControllerReadOptions,
  budgetsControllerListOptions,
  transactionsControllerCreateMutation,
  transactionsControllerPayeesOptions,
  transfersControllerCreateMutation,
} from '@rondo/api-client/react-query';
import { monthOf, todayIn } from '@rondo/types';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@rondo/ui/components/ui/dialog';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@rondo/ui/components/ui/drawer';
import { useIsMobile } from '@rondo/ui/hooks/use-mobile';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState, type ReactNode } from 'react';

import {
  TransactionDialog,
  type TransactionDraft,
  type TransferDraft,
} from '@/components/transaction-dialog';
import { useTranslations } from '@/i18n/locale-context';
import type { MessageKey } from '@/i18n/messages';
import { NO_LAST_ENTRY, readLastEntry, storeLastEntry, type LastEntry } from '@/lib/last-entry';
import { moneyOf } from '@/lib/money';
import { offeredCategory, pickableGroups } from '@/lib/pickable-groups';
import { rereadEntries } from '@/lib/reread-entries';
import { transactionFailure } from '@/lib/transaction-failure';
import { transferFailure } from '@/lib/transfer-failure';

export interface EntryPreference {
  categoryId: string | null;
  accountId: string | null;
}

const nothing = (): void => undefined;

export function NewEntryDialog({
  prefer,
  on,
  onClose,
  returnFocus,
}: {
  prefer: EntryPreference;
  on?: string;
  onClose: () => void;
  returnFocus?: () => HTMLElement | null;
}): ReactNode {
  const { t, locale } = useTranslations();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();

  const [failed, setFailed] = useState<MessageKey | null>(null);
  const [written, setWritten] = useState(0);
  const [remembered, setRemembered] = useState<LastEntry | null>(null);

  const budgets = useQuery(budgetsControllerListOptions());
  const budget = budgets.data?.find((candidate) => candidate.active) ?? null;
  const budgetId = budget?.id ?? null;
  const today = budget === null ? null : todayIn(budget.timezone);

  const accounts = useQuery(accountsControllerListOptions());
  const payees = useQuery(transactionsControllerPayeesOptions());
  const view = useQuery({
    ...budgetViewControllerReadOptions({
      query: { month: today === null ? '2026-01' : monthOf(today), includeHidden: true },
    }),
    enabled: today !== null,
  });

  const stored = useMemo(
    () => (budgetId === null || today === null ? NO_LAST_ENTRY : readLastEntry(budgetId, today)),
    [budgetId, today],
  );
  const last = remembered ?? stored;

  const money = useMemo(
    () => (budget === null ? null : moneyOf(locale, budget.currency, budget.minorDigits)),
    [budget, locale],
  );

  const remember = (entry: LastEntry): void => {
    setRemembered(entry);
    if (budgetId !== null && today !== null) {
      storeLastEntry(budgetId, entry, today);
    }
  };

  const landed = (): void => {
    setFailed(null);
    setWritten((count) => count + 1);
    void rereadEntries(queryClient);
  };

  const settled = async (): Promise<void> => {
    onClose();
    await rereadEntries(queryClient);
  };

  const write = useMutation({
    ...transactionsControllerCreateMutation(),
    onError: (error) => setFailed(transactionFailure(error)),
  });

  const writeTransfer = useMutation({
    ...transfersControllerCreateMutation(),
    onError: (error) => setFailed(transferFailure(error)),
  });

  const save = (draft: TransactionDraft, andMore: boolean): void => {
    remember({ date: draft.date, categoryId: draft.categoryId, payee: draft.payee });

    write.mutate(
      {
        body: {
          accountId: draft.accountId,
          type: draft.type,
          amount: draft.amount,
          date: draft.date,
          ...(draft.categoryId === null ? {} : { categoryId: draft.categoryId }),
          ...(draft.payee === null ? {} : { payee: draft.payee }),
          idempotencyKey: draft.idempotencyKey,
        },
      },
      { onSuccess: andMore ? landed : settled },
    );
  };

  const saveTransfer = (draft: TransferDraft, andMore: boolean): void => {
    remember({ ...last, date: draft.date });

    writeTransfer.mutate(
      {
        body: {
          fromAccountId: draft.fromAccountId,
          toAccountId: draft.toAccountId,
          amount: draft.amount,
          date: draft.date,
          idempotencyKey: draft.idempotencyKey,
        },
      },
      { onSuccess: andMore ? landed : settled },
    );
  };

  const open = accounts.data?.accounts;

  if (money === null || today === null || open === undefined || view.data === undefined) {
    return null;
  }

  const groups = pickableGroups(view.data);
  const startsOn = open.find((one) => one.id === prefer.accountId) ?? open[0];

  const surface = (
    <TransactionDialog
      key={prefer.categoryId ?? 'none'}
      record={null}
      accounts={open}
      groups={groups}
      kept={null}
      payees={payees.data?.payees ?? []}
      money={money}
      today={today}
      defaults={{
        accountId: startsOn?.id ?? '',
        date: on ?? last.date ?? today,
        categoryId: offeredCategory(groups, prefer.categoryId ?? last.categoryId),
        payee: prefer.categoryId === null ? last.payee : null,
      }}
      failed={failed}
      busy={write.isPending || writeTransfer.isPending}
      written={written}
      onSave={save}
      onTransfer={saveTransfer}
      onCorrectOpening={nothing}
      onDelete={nothing}
    />
  );

  const close = (next: boolean): void => {
    if (!next) onClose();
  };

  return isMobile ? (
    <Drawer showSwipeHandle open onOpenChange={close}>
      <DrawerContent className="max-h-[92dvh]" finalFocus={returnFocus ?? true}>
        <DrawerHeader className="pb-0">
          <DrawerTitle className="sr-only">{t('transactions.createTitle')}</DrawerTitle>
        </DrawerHeader>
        <div className="overflow-y-auto px-4 pb-6">{surface}</div>
      </DrawerContent>
    </Drawer>
  ) : (
    <Dialog open onOpenChange={close}>
      <DialogContent
        closeLabel={t('common.close')}
        finalFocus={returnFocus ?? true}
        className="max-h-[85dvh] gap-0 overflow-x-hidden overflow-y-auto rounded-[24px] p-6 sm:max-w-[480px]"
      >
        <DialogTitle className="sr-only">{t('transactions.createTitle')}</DialogTitle>
        <DialogDescription className="sr-only">{t('transactions.add')}</DialogDescription>
        {surface}
      </DialogContent>
    </Dialog>
  );
}
