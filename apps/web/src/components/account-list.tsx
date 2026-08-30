'use client';

import {
  accountsControllerCreateMutation,
  accountsControllerListOptions,
  accountsControllerListQueryKey,
  accountsControllerRenameMutation,
  budgetViewControllerReadQueryKey,
  budgetsControllerListOptions,
} from '@rondo/api-client/react-query';
import { parseMoney, type AccountType } from '@rondo/types';
import { Button } from '@rondo/ui/components/ui/button';
import { Card, CardContent } from '@rondo/ui/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@rondo/ui/components/ui/dialog';
import { cn } from '@rondo/ui/lib/utils';
import { IconCash, IconCreditCard, IconPencil, IconPlus } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { AccountDialog, type AccountDraft } from '@/components/account-dialog';
import { useTranslations } from '@/i18n/locale-context';
import { type MessageKey } from '@/i18n/messages';
import { moneyOf } from '@/lib/money';
import { keepsTheKey, saveFailureKind, type SaveFailureKind } from '@/lib/save-failure';

type Editing = { kind: 'create' } | { kind: 'rename'; id: string; name: string; type: AccountType };

const LOOK: Record<AccountType, { Icon: typeof IconCash; label: MessageKey }> = {
  CASH: { Icon: IconCash, label: 'newAccount.typeCash' },
  DEBIT: { Icon: IconCreditCard, label: 'newAccount.typeDebit' },
};

export function AccountList() {
  const { t, locale } = useTranslations();
  const queryClient = useQueryClient();

  const budgets = useQuery(budgetsControllerListOptions());
  const budget = budgets.data?.find((candidate) => candidate.active) ?? null;

  const accounts = useQuery(accountsControllerListOptions());

  const [editing, setEditing] = useState<Editing | null>(null);
  const [failure, setFailure] = useState<SaveFailureKind | null>(null);
  const [sent, setSent] = useState(false);

  const money = useMemo(
    () => (budget === null ? null : moneyOf(locale, budget.currency, budget.minorDigits)),
    [budget, locale],
  );

  const reread = async (): Promise<void> => {
    const [named] = budgetViewControllerReadQueryKey({ query: { month: '' } });

    await queryClient.invalidateQueries({ queryKey: accountsControllerListQueryKey() });
    await queryClient.invalidateQueries({ queryKey: [{ _id: named._id }] });
  };

  const settled = async (): Promise<void> => {
    setEditing(null);
    setFailure(null);
    setSent(false);
    await reread();
  };

  const refused = (error: unknown): void => {
    if (editing === null) return;

    setFailure(saveFailureKind(error));
  };

  const create = useMutation({
    ...accountsControllerCreateMutation(),
    onSuccess: settled,
    onError: refused,
  });

  const rename = useMutation({
    ...accountsControllerRenameMutation(),
    onSuccess: settled,
    onError: refused,
  });

  if (accounts.isError || budgets.isError) {
    return (
      <p role="alert" className="text-destructive text-sm">
        {t('accounts.unavailable')}
      </p>
    );
  }

  if (money === null || accounts.data === undefined) {
    return null;
  }

  const held = accounts.data.accounts;
  const total = parseMoney(accounts.data.total);

  const save = (draft: AccountDraft): void => {
    if (editing === null) return;

    setSent(true);

    if (editing.kind === 'rename') {
      rename.mutate({
        path: { id: editing.id },
        body: { name: draft.name, idempotencyKey: draft.idempotencyKey },
      });

      return;
    }

    create.mutate({
      body: {
        name: draft.name,
        type: draft.type,
        initialBalance: draft.initialBalance,
        idempotencyKey: draft.idempotencyKey,
      },
    });
  };

  const close = (): void => {
    setEditing(null);
    setFailure(null);

    if (sent) {
      setSent(false);
      void reread();
    }
  };

  return (
    <div className="flex max-w-xl flex-col gap-4">
      <Card>
        <CardContent className="flex flex-col gap-1">
          {held.length === 0 ? (
            <p className="text-muted-foreground py-2 text-sm">{t('accounts.empty')}</p>
          ) : (
            <ul className="flex flex-col">
              {held.map((account) => {
                const look = LOOK[account.type];
                const balance = parseMoney(account.balance);

                return (
                  <li key={account.id} className="flex items-center gap-3 py-2.5">
                    <span className="bg-secondary text-muted-foreground grid size-9 shrink-0 place-items-center rounded-full">
                      <look.Icon aria-hidden className="size-4.5" />
                    </span>

                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-medium">{account.name}</span>
                      <span className="text-muted-foreground text-xs">{t(look.label)}</span>
                    </span>

                    <span
                      data-testid={`balance-${account.id}`}
                      className={cn(
                        'text-sm font-medium tabular-nums',
                        balance < 0n && 'text-destructive',
                      )}
                    >
                      {money.format(balance)}
                    </span>

                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={t('accounts.renameOne', { name: account.name })}
                      onClick={() =>
                        setEditing({
                          kind: 'rename',
                          id: account.id,
                          name: account.name,
                          type: account.type,
                        })
                      }
                    >
                      <IconPencil className="size-4" />
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {held.length === 0 ? null : (
        <div className="flex items-baseline justify-between gap-3 px-1">
          <span className="text-muted-foreground text-sm">{t('accounts.total')}</span>
          <span
            data-testid="accounts-total"
            className={cn(
              'text-xl font-semibold tracking-tight tabular-nums',
              total < 0n && 'text-destructive',
            )}
          >
            {money.format(total)}
          </span>
        </div>
      )}

      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          className="h-8 rounded-2xl px-3"
          onClick={() => setEditing({ kind: 'create' })}
        >
          <IconPlus className="size-4" />
          {t('accounts.add')}
        </Button>
      </div>

      <Dialog open={editing !== null} onOpenChange={(next) => (next ? null : close())}>
        <DialogContent className="max-h-[85dvh] gap-0 overflow-x-hidden overflow-y-auto rounded-[24px] p-6 sm:max-w-[480px]">
          <DialogTitle className="sr-only">
            {t(editing?.kind === 'rename' ? 'accounts.renameTitle' : 'accounts.createTitle')}
          </DialogTitle>
          <DialogDescription className="sr-only">{t('accounts.add')}</DialogDescription>
          {editing === null ? null : (
            <AccountDialog
              account={editing.kind === 'rename' ? editing : null}
              money={money}
              failure={failure}
              busy={create.isPending || rename.isPending}
              frozen={failure !== null && keepsTheKey(failure)}
              onSave={save}
              onEdited={() => setFailure(null)}
              onCancel={close}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
