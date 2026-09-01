'use client';

import {
  accountsControllerCreateMutation,
  accountsControllerListOptions,
  accountsControllerListQueryKey,
  accountsControllerCorrectOpeningMutation,
  accountsControllerRenameMutation,
  budgetViewControllerReadOptions,
  budgetViewControllerReadQueryKey,
  budgetsControllerListOptions,
  transactionsControllerCreateMutation,
  transactionsControllerListInfiniteOptions,
  transactionsControllerListQueryKey,
  transactionsControllerPayeesOptions,
  transactionsControllerPayeesQueryKey,
  transactionsControllerRemoveMutation,
  transactionsControllerUpdateMutation,
  transfersControllerCreateMutation,
  transfersControllerRemoveMutation,
  transfersControllerUpdateMutation,
} from '@rondo/api-client/react-query';
import { monthOf, todayIn, type AccountType, type TransactionDto } from '@rondo/types';
import { Button } from '@rondo/ui/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@rondo/ui/components/ui/dialog';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@rondo/ui/components/ui/drawer';
import { useIsMobile } from '@rondo/ui/hooks/use-mobile';
import { cn } from '@rondo/ui/lib/utils';
import { IconPlus } from '@tabler/icons-react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { AccountDialog, type AccountDraft } from '@/components/account-dialog';
import { AccountPanel } from '@/components/account-panel';
import { DeleteTransactionDialog } from '@/components/delete-transaction-dialog';
import { TransactionDay } from '@/components/transaction-day';
import {
  TransactionDialog,
  type OpeningDraft,
  type PickableCategory,
  type PickableGroup,
  type TransactionDraft,
  type TransferDraft,
} from '@/components/transaction-dialog';
import { AddTodayRow, TransactionEmpty } from '@/components/transaction-empty';
import {
  FilterToggle,
  TransactionFilters,
  activeFilters,
  NO_FILTERS,
  type Filters,
} from '@/components/transaction-filters';
import { type CategoryLookOf } from '@/components/transaction-row';
import { useTranslations } from '@/i18n/locale-context';
import type { MessageKey } from '@/i18n/messages';
import { accountFailure as openingFailure } from '@/lib/account-failure';
import { dayOf } from '@/lib/calendar-day';
import { calendarLocale } from '@/lib/calendar-locale';
import { NO_LAST_ENTRY, readLastEntry, storeLastEntry, type LastEntry } from '@/lib/last-entry';
import { moneyOf } from '@/lib/money';
import { keepsTheKey, saveFailureKind, type SaveFailureKind } from '@/lib/save-failure';
import { transactionFailure } from '@/lib/transaction-failure';
import { feedDays } from '@/lib/transaction-feed';
import { transferFailure } from '@/lib/transfer-failure';

type Editing =
  | { kind: 'create'; on?: string }
  | { kind: 'edit'; record: TransactionDto }
  | { kind: 'delete'; record: TransactionDto; key: string }
  | { kind: 'account' }
  | { kind: 'rename'; id: string; name: string; type: AccountType };

export function MoneyFlow(): ReactNode {
  const { t, locale } = useTranslations();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();

  const [accountId, setAccountId] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [failed, setFailed] = useState<MessageKey | null>(null);
  const [accountFailure, setAccountFailure] = useState<SaveFailureKind | null>(null);
  const [sent, setSent] = useState(false);
  const [last, setLast] = useState<LastEntry>(NO_LAST_ENTRY);
  const [written, setWritten] = useState(0);

  const budgets = useQuery(budgetsControllerListOptions());
  const budget = budgets.data?.find((candidate) => candidate.active) ?? null;

  const budgetId = budget?.id ?? null;

  const today = budget === null ? null : todayIn(budget.timezone);

  useEffect(() => {
    setLast(budgetId === null || today === null ? NO_LAST_ENTRY : readLastEntry(budgetId, today));
  }, [budgetId, today]);

  const accounts = useQuery(accountsControllerListOptions());
  const payees = useQuery(transactionsControllerPayeesOptions());

  const view = useQuery({
    ...budgetViewControllerReadOptions({
      query: {
        month: today === null ? '2026-01' : monthOf(today),
        includeHidden: true,
      },
    }),
    enabled: today !== null,
  });

  const feed = useInfiniteQuery({
    ...transactionsControllerListInfiniteOptions({
      query: {
        ...(accountId === null ? {} : { accountId }),
        ...(filters.payee === null ? {} : { payee: filters.payee }),
        ...(filters.categoryId === null ? {} : { categoryId: filters.categoryId }),
        ...(filters.type === null ? {} : { type: filters.type }),
        ...(filters.from === null ? {} : { from: filters.from }),
        ...(filters.to === null ? {} : { to: filters.to }),
      },
    }),
    initialPageParam: {},
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: budget !== null,
  });

  const edge = useRef<HTMLDivElement | null>(null);

  const { hasNextPage, isFetchingNextPage, fetchNextPage } = feed;

  useEffect(() => {
    const marker = edge.current;
    if (!marker || !hasNextPage || isFetchingNextPage) {
      return;
    }

    const watcher = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        void fetchNextPage();
      }
    });

    watcher.observe(marker);

    return () => watcher.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const money = useMemo(
    () => (budget === null ? null : moneyOf(locale, budget.currency, budget.minorDigits)),
    [budget, locale],
  );

  const groups: PickableGroup[] = (view.data?.groups ?? [])
    .filter((group) => !group.hidden)
    .map((group) => ({
      id: group.id,
      name: group.name,
      categories: group.categories
        .filter((category) => !category.hidden)
        .map((category) => ({
          id: category.id,
          name: category.name,
          icon: category.icon,
          color: category.color,
        })),
    }))
    .filter((group) => group.categories.length > 0);

  const looks = new Map<string, CategoryLookOf>(
    (view.data?.groups ?? []).flatMap((group) =>
      group.categories.map(
        (category) =>
          [category.id, { name: category.name, icon: category.icon, color: category.color }] as [
            string,
            CategoryLookOf,
          ],
      ),
    ),
  );

  const named = new Map<string, string>(
    (accounts.data?.accounts ?? []).map((account) => [account.id, account.name]),
  );

  const offered = (id: string | null): string | null =>
    id !== null && groups.some((group) => group.categories.some((one) => one.id === id))
      ? id
      : null;

  const keptOf = (id: string | null): PickableCategory | null => {
    const look = id === null ? null : (looks.get(id) ?? null);

    return look === null || id === null
      ? null
      : { id, name: look.name, icon: look.icon, color: look.color };
  };

  const reread = async (): Promise<void> => {
    const [view] = budgetViewControllerReadQueryKey({ query: { month: '' } });
    const [entries] = transactionsControllerListQueryKey();
    const [known] = transactionsControllerPayeesQueryKey();

    await queryClient.invalidateQueries({ queryKey: accountsControllerListQueryKey() });
    await queryClient.invalidateQueries({ queryKey: [{ _id: view._id }] });
    await queryClient.invalidateQueries({ queryKey: [{ _id: entries._id }] });
    await queryClient.invalidateQueries({ queryKey: [{ _id: known._id }] });
  };

  const settled = async (): Promise<void> => {
    setEditing(null);
    setFailed(null);
    setAccountFailure(null);
    setSent(false);
    await reread();
  };

  const refused = (error: unknown): void => {
    setFailed(transactionFailure(error));
  };

  const refusedTransfer = (error: unknown): void => {
    setFailed(transferFailure(error));
  };

  const write = useMutation({ ...transactionsControllerCreateMutation(), onError: refused });

  const change = useMutation({
    ...transactionsControllerUpdateMutation(),
    onSuccess: settled,
    onError: refused,
  });

  const drop = useMutation({
    ...transactionsControllerRemoveMutation(),
    onSuccess: settled,
    onError: refused,
  });

  const writeTransfer = useMutation({
    ...transfersControllerCreateMutation(),
    onSuccess: settled,
    onError: refusedTransfer,
  });

  const changeTransfer = useMutation({
    ...transfersControllerUpdateMutation(),
    onSuccess: settled,
    onError: refusedTransfer,
  });

  const dropTransfer = useMutation({
    ...transfersControllerRemoveMutation(),
    onSuccess: settled,
    onError: refusedTransfer,
  });

  const refusedOpening = (error: unknown): void => {
    setFailed(openingFailure(error));
  };

  const correctOpening = useMutation({
    ...accountsControllerCorrectOpeningMutation(),
    onSuccess: settled,
    onError: refusedOpening,
  });

  const refusedAccount = (error: unknown): void => {
    setAccountFailure(saveFailureKind(error));
  };

  const addAccount = useMutation({
    ...accountsControllerCreateMutation(),
    onSuccess: settled,
    onError: refusedAccount,
  });

  const renameAccount = useMutation({
    ...accountsControllerRenameMutation(),
    onSuccess: settled,
    onError: refusedAccount,
  });

  const unread =
    (accounts.isError && accounts.data === undefined) ||
    (budgets.isError && budgets.data === undefined) ||
    (feed.isError && feed.data === undefined);

  if (unread) {
    return (
      <p role="alert" className="text-destructive text-sm">
        {t('transactions.unavailable')}
      </p>
    );
  }

  if (money === null || today === null || accounts.data === undefined) {
    return null;
  }

  const records = (feed.data?.pages ?? []).flatMap((page) => page.transactions);
  const totals = (feed.data?.pages ?? []).flatMap((page) => page.days);
  const days = feedDays(records, totals, today);
  const filtered = Object.values(filters).some((value) => value !== null);

  const save = (draft: TransactionDraft, andMore: boolean): void => {
    const body = {
      accountId: draft.accountId,
      type: draft.type,
      amount: draft.amount,
      date: draft.date,
      ...(draft.categoryId === null ? {} : { categoryId: draft.categoryId }),
      ...(draft.payee === null ? {} : { payee: draft.payee }),
      idempotencyKey: draft.idempotencyKey,
    };

    if (editing?.kind === 'edit') {
      change.mutate({ path: { id: editing.record.id }, body });

      return;
    }

    const entry: LastEntry = {
      date: draft.date,
      categoryId: draft.categoryId,
      payee: draft.payee,
    };

    setLast(entry);
    if (budgetId !== null) {
      storeLastEntry(budgetId, entry, today);
    }

    write.mutate(
      { body },
      {
        onSuccess: andMore
          ? () => {
              setWritten((count) => count + 1);
              void reread();
            }
          : settled,
      },
    );
  };

  const saveTransfer = (draft: TransferDraft): void => {
    const body = {
      fromAccountId: draft.fromAccountId,
      toAccountId: draft.toAccountId,
      amount: draft.amount,
      date: draft.date,
      idempotencyKey: draft.idempotencyKey,
    };

    const held = editing?.kind === 'edit' ? editing.record.transferId : null;

    if (held !== null) {
      changeTransfer.mutate({ path: { transferId: held }, body });

      return;
    }

    writeTransfer.mutate({ body });
  };

  const saveOpening = (draft: OpeningDraft): void => {
    correctOpening.mutate({
      path: { id: draft.accountId },
      body: { amount: draft.amount, idempotencyKey: draft.idempotencyKey },
    });
  };

  const saveAccount = (draft: AccountDraft): void => {
    setSent(true);

    if (editing?.kind === 'rename') {
      renameAccount.mutate({
        path: { id: editing.id },
        body: { name: draft.name, idempotencyKey: draft.idempotencyKey },
      });

      return;
    }

    addAccount.mutate({
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
    setFailed(null);
    setAccountFailure(null);

    if (sent) {
      setSent(false);
      void reread();
    }
  };

  const busy =
    write.isPending ||
    change.isPending ||
    drop.isPending ||
    writeTransfer.isPending ||
    changeTransfer.isPending ||
    dropTransfer.isPending ||
    correctOpening.isPending;

  const titleOf = (open: Editing | null): string => {
    if (open?.kind === 'edit') return t('transactions.editTitle');
    if (open?.kind === 'delete') return t('transactions.delete');
    if (open?.kind === 'rename') return t('accounts.renameTitle');
    if (open?.kind === 'account') return t('accounts.createTitle');

    return t('transactions.createTitle');
  };

  const surface = (
    <>
      {editing?.kind === 'create' || editing?.kind === 'edit' ? (
        <TransactionDialog
          record={editing.kind === 'edit' ? editing.record : null}
          accounts={accounts.data.accounts}
          groups={groups}
          kept={editing.kind === 'edit' ? keptOf(editing.record.categoryId) : null}
          payees={payees.data?.payees ?? []}
          money={money}
          today={today}
          defaults={{
            accountId: accountId ?? accounts.data.accounts[0]?.id ?? '',
            date: editing.kind === 'create' ? (editing.on ?? last.date ?? today) : today,
            categoryId: offered(last.categoryId),
            payee: last.payee,
          }}
          failed={failed}
          busy={busy}
          written={written}
          onSave={save}
          onTransfer={saveTransfer}
          onCorrectOpening={saveOpening}
          onDelete={() => {
            setFailed(null);
            setEditing(
              editing.kind === 'edit'
                ? { kind: 'delete', record: editing.record, key: crypto.randomUUID() }
                : editing,
            );
          }}
        />
      ) : null}

      {editing?.kind === 'delete' ? (
        <DeleteTransactionDialog
          record={editing.record}
          money={money}
          accountName={(id) => named.get(id) ?? null}
          categoryName={(id) => looks.get(id)?.name ?? null}
          failed={failed}
          busy={busy}
          onDelete={() => {
            const held = editing.record.transferId;

            if (held !== null) {
              dropTransfer.mutate({
                path: { transferId: held },
                body: { idempotencyKey: editing.key },
              });

              return;
            }

            drop.mutate({
              path: { id: editing.record.id },
              body: { idempotencyKey: editing.key },
            });
          }}
          onCancel={close}
        />
      ) : null}

      {editing?.kind === 'account' || editing?.kind === 'rename' ? (
        <AccountDialog
          account={editing.kind === 'rename' ? editing : null}
          money={money}
          failure={accountFailure}
          busy={addAccount.isPending || renameAccount.isPending}
          frozen={accountFailure !== null && keepsTheKey(accountFailure)}
          onSave={saveAccount}
          onEdited={() => setAccountFailure(null)}
          onCancel={close}
        />
      ) : null}
    </>
  );

  const renameAccountOf = (account: { id: string; name: string; type: AccountType }): void => {
    setEditing({ kind: 'rename', id: account.id, name: account.name, type: account.type });
  };

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <div className="lg:hidden">
        <AccountPanel
          accounts={accounts.data.accounts}
          total={accounts.data.total}
          money={money}
          selected={accountId}
          variant="switcher"
          onSelect={setAccountId}
          onAdd={() => setEditing({ kind: 'account' })}
          onRename={renameAccountOf}
        />
      </div>

      <div className="hidden lg:block lg:w-full lg:max-w-xs">
        <AccountPanel
          accounts={accounts.data.accounts}
          total={accounts.data.total}
          money={money}
          selected={accountId}
          onSelect={setAccountId}
          onAdd={() => setEditing({ kind: 'account' })}
          onRename={renameAccountOf}
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <FilterToggle
              count={activeFilters(filters)}
              open={filtersOpen}
              onToggle={() => setFiltersOpen(!filtersOpen)}
              onReset={() => setFilters(NO_FILTERS)}
            />

            {isMobile ? null : (
              <Button
                type="button"
                className="h-9 rounded-2xl px-4"
                onClick={() => setEditing({ kind: 'create' })}
              >
                <IconPlus className="size-4" />
                {t('transactions.add')}
              </Button>
            )}
          </div>

          <div
            className={cn(
              '-mx-2 grid transition-[grid-template-rows,opacity] duration-200 ease-out',
              filtersOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
            )}
            inert={!filtersOpen}
          >
            <div className="overflow-hidden px-2 pt-1 pb-2">
              <TransactionFilters
                filters={filters}
                groups={groups}
                payees={payees.data?.payees ?? []}
                today={today}
                onChange={setFilters}
              />
            </div>
          </div>
        </div>

        {days.length === 0 ? (
          <TransactionEmpty filtered={filtered} onReset={() => setFilters(NO_FILTERS)} />
        ) : (
          <div className="flex flex-col gap-5">
            {!filtered && days[0]?.name !== 'today' ? (
              <AddTodayRow
                heading={`${t('transactions.today')}, ${format(dayOf(today), 'd MMMM', {
                  locale: calendarLocale(locale),
                })}`}
                onAdd={() => setEditing({ kind: 'create', on: today })}
              />
            ) : null}

            {days.map((day) => (
              <TransactionDay
                key={day.date}
                day={day}
                money={money}
                timeZone={budget?.timezone ?? 'UTC'}
                accountName={(id) => named.get(id) ?? null}
                categoryOf={(id) => looks.get(id) ?? null}
                showAccount={accountId === null}
                onOpen={(record) => setEditing({ kind: 'edit', record })}
                onDelete={(record) =>
                  setEditing({ kind: 'delete', record, key: crypto.randomUUID() })
                }
              />
            ))}

            {feed.hasNextPage ? (
              <div
                ref={edge}
                data-testid="feed-edge"
                className="text-muted-foreground py-4 text-center text-xs"
              >
                {t('transactions.loadingMore')}
              </div>
            ) : null}
          </div>
        )}
      </div>

      {isMobile ? (
        <Button
          type="button"
          className="fixed right-4 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-30 h-12 rounded-full px-5 shadow-lg"
          onClick={() => setEditing({ kind: 'create' })}
        >
          <IconPlus className="size-4" />
          {t('transactions.add')}
        </Button>
      ) : null}

      {isMobile ? (
        <Drawer
          showSwipeHandle
          open={editing !== null}
          onOpenChange={(next) => (next ? null : close())}
        >
          <DrawerContent className="max-h-[92dvh]">
            <DrawerHeader className="pb-0">
              <DrawerTitle className="sr-only">{titleOf(editing)}</DrawerTitle>
            </DrawerHeader>
            <div className="overflow-y-auto px-4 pb-6">{surface}</div>
          </DrawerContent>
        </Drawer>
      ) : (
        <Dialog open={editing !== null} onOpenChange={(next) => (next ? null : close())}>
          <DialogContent className="max-h-[85dvh] gap-0 overflow-x-hidden overflow-y-auto rounded-[24px] p-6 sm:max-w-[480px]">
            <DialogTitle className="sr-only">{titleOf(editing)}</DialogTitle>
            <DialogDescription className="sr-only">{t('transactions.add')}</DialogDescription>
            {surface}
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
