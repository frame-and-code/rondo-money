'use client';

import {
  accountsControllerCorrectOpeningMutation,
  accountsControllerListOptions,
  accountsControllerListQueryKey,
  budgetsControllerListOptions,
  budgetViewControllerReadQueryKey,
  netWorthControllerReadQueryKey,
  transactionsControllerListQueryKey,
} from '@rondo/api-client/react-query';
import { parseMoney } from '@rondo/types';
import { ThemeToggle } from '@rondo/ui/components/theme-toggle';
import { Button } from '@rondo/ui/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@rondo/ui/components/ui/card';
import { Label } from '@rondo/ui/components/ui/label';
import { cn } from '@rondo/ui/lib/utils';
import { IconLoader } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useMemo, useState, type FormEvent } from 'react';

import { FailureAlert } from '@/components/failure-alert';
import { MONEY_FIELD, MoneyField } from '@/components/money-field';
import { OnboardingSteps } from '@/components/onboarding-steps';
import { useTranslations } from '@/i18n/locale-context';
import { moneyOf } from '@/lib/money';
import { onboardingRoute } from '@/lib/onboarding';
import { keepsTheKey, saveFailureKind } from '@/lib/save-failure';
import { APP_MARK, APP_NAME } from '@/lib/sections';

const CONTROL = 'h-11 rounded-full px-3.5 text-sm md:h-8 md:rounded-2xl md:px-3';

const FIELD = cn(MONEY_FIELD, CONTROL);

function mintKey(): string {
  return crypto.randomUUID();
}

function without(ids: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(ids);
  next.delete(id);

  return next;
}

export function BalancesForm() {
  const { t, locale } = useTranslations();
  const queryClient = useQueryClient();
  const router = useRouter();

  const { data: budgets } = useQuery(budgetsControllerListOptions());
  const listed = useQuery(accountsControllerListOptions());
  const correct = useMutation(accountsControllerCorrectOpeningMutation());

  const budget = budgets?.find((candidate) => candidate.active) ?? null;
  const money = useMemo(
    () => (budget === null ? null : moneyOf(locale, budget.currency, budget.minorDigits)),
    [budget, locale],
  );
  const accounts = listed.data?.accounts;

  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [failed, setFailed] = useState<ReadonlySet<string>>(new Set());
  const [sending, setSending] = useState(false);

  if (accounts !== undefined && money !== null) {
    const unseen = accounts.filter((account) => !(account.id in drafts));
    if (unseen.length > 0) {
      const held = (balance: string): string => {
        const minor = parseMoney(balance);

        return minor === 0n ? '' : money.typed(minor);
      };
      setDrafts({
        ...drafts,
        ...Object.fromEntries(unseen.map((account) => [account.id, held(account.balance)])),
      });
      setKeys({
        ...keys,
        ...Object.fromEntries(unseen.map((account) => [account.id, mintKey()])),
      });
    }
  }

  const editable = (accounts ?? []).filter((account) => account.openingEditable);
  const reads = editable.map((account) => ({
    account,
    read: money === null ? null : money.read(drafts[account.id] ?? ''),
  }));
  const unreadable = reads.some(({ read }) => read === null || read.minor === null || read.partial);
  const ready = accounts !== undefined && money !== null && !unreadable;

  const typed = (id: string, next: string): void => {
    setDrafts({ ...drafts, [id]: next });
    if (!failed.has(id)) return;

    setFailed(without(failed, id));
    setKeys({ ...keys, [id]: mintKey() });
  };

  const reread = async (): Promise<void> => {
    const [view] = budgetViewControllerReadQueryKey({ query: { month: '' } });
    const [entries] = transactionsControllerListQueryKey();
    const [worth] = netWorthControllerReadQueryKey();

    await Promise.all([
      queryClient.invalidateQueries({ queryKey: accountsControllerListQueryKey() }),
      queryClient.invalidateQueries({ queryKey: [{ _id: view._id }] }),
      queryClient.invalidateQueries({ queryKey: [{ _id: entries._id }] }),
      queryClient.invalidateQueries({ queryKey: [{ _id: worth._id }] }),
    ]);
  };

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (!ready || sending) return;

    const changed = reads.flatMap(({ account, read }) =>
      read !== null &&
      read.typed &&
      read.minor !== null &&
      read.minor !== parseMoney(account.balance)
        ? [{ id: account.id, minor: read.minor }]
        : [],
    );

    if (changed.length === 0) {
      router.replace(onboardingRoute('app'));
      return;
    }

    setSending(true);
    const outcomes = await Promise.allSettled(
      changed.map(({ id, minor }) =>
        correct.mutateAsync({
          path: { id },
          body: { amount: minor.toString(10), idempotencyKey: keys[id] ?? mintKey() },
        }),
      ),
    );

    const nextKeys = { ...keys };
    const nextFailed = new Set<string>();
    outcomes.forEach((outcome, index) => {
      const id = changed[index]?.id;
      if (id === undefined) return;

      if (outcome.status === 'rejected') {
        nextFailed.add(id);
        if (keepsTheKey(saveFailureKind(outcome.reason))) return;
      }
      nextKeys[id] = mintKey();
    });

    setKeys(nextKeys);
    setFailed(nextFailed);
    await reread();
    setSending(false);

    if (nextFailed.size === 0) {
      router.replace(onboardingRoute('app'));
    }
  };

  const unavailable = listed.isError && accounts === undefined;

  return (
    <>
      <div className="flex justify-end max-md:mb-6 md:absolute md:end-6 md:top-6">
        <ThemeToggle label={t('common.themeToggle.trigger')} />
      </div>

      <div className="grid gap-10 md:grid-cols-2 md:items-center md:gap-16">
        <div className="flex flex-col gap-8">
          <div className="hidden items-center gap-2 md:flex">
            <span className="bg-primary text-primary-foreground grid size-8 place-items-center rounded-lg text-sm font-semibold">
              {APP_MARK}
            </span>
            <span className="font-semibold">{APP_NAME}</span>
          </div>

          <div className="flex flex-col gap-3">
            <h1 className="text-[26px] font-semibold tracking-tight md:text-[34px]">
              {t('balances.heading')}
            </h1>
            <p className="text-muted-foreground text-sm">{t('balances.lead')}</p>
          </div>

          <OnboardingSteps done={1} variant="copy" />
        </div>

        <Card className="max-md:rounded-none max-md:bg-transparent max-md:py-0 max-md:shadow-none max-md:ring-0">
          <CardHeader className="max-md:hidden">
            <CardTitle>{t('balances.cardTitle')}</CardTitle>
          </CardHeader>

          <CardContent className="max-md:px-0">
            {unavailable ? (
              <p role="alert" className="text-destructive text-sm">
                {t('onboarding.unavailable')}
              </p>
            ) : (
              <form
                onSubmit={(event) => {
                  void submit(event);
                }}
                className="flex flex-col gap-6"
              >
                {failed.size > 0 ? <FailureAlert>{t('common.failLater')}</FailureAlert> : null}

                {money === null
                  ? null
                  : (accounts ?? []).map((account) =>
                      account.openingEditable ? (
                        <div key={account.id} className="flex flex-col gap-2">
                          <Label htmlFor={`balance-${account.id}`}>{account.name}</Label>
                          <MoneyField
                            id={`balance-${account.id}`}
                            money={money}
                            amount={drafts[account.id] ?? ''}
                            read={money.read(drafts[account.id] ?? '')}
                            disabled={sending}
                            className={cn(
                              FIELD,
                              failed.has(account.id) && 'ring-destructive/45 ring-3',
                            )}
                            onChange={(next) => {
                              typed(account.id, next);
                            }}
                          />
                        </div>
                      ) : (
                        <div
                          key={account.id}
                          className="flex items-baseline justify-between gap-3 text-sm"
                        >
                          <span>{account.name}</span>
                          <span className="text-muted-foreground">
                            {money.format(parseMoney(account.balance))}
                          </span>
                        </div>
                      ),
                    )}

                <Button type="submit" disabled={!ready || sending} className={CONTROL}>
                  {sending ? <IconLoader className="size-4 animate-spin" /> : null}
                  {t('balances.submit')}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
