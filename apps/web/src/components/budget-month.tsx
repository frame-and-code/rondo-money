'use client';

import { type CreateMoveDto } from '@rondo/api-client';
import {
  budgetViewControllerReadOptions,
  budgetViewControllerReadQueryKey,
  budgetsControllerListOptions,
  movesControllerMoveMutation,
} from '@rondo/api-client/react-query';
import { toDecimalString, type CalendarMonth } from '@rondo/types';
import { Button } from '@rondo/ui/components/ui/button';
import {
  Drawer,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@rondo/ui/components/ui/drawer';
import { useIsMobile } from '@rondo/ui/hooks/use-mobile';
import { cn } from '@rondo/ui/lib/utils';
import { IconWallet } from '@tabler/icons-react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

import { BudgetMonthHeader } from '@/components/budget-month-header';
import { BudgetMonthLoading } from '@/components/budget-month-loading';
import { CategoryGroup } from '@/components/category-group';
import { CategoryTile } from '@/components/category-tile';
import { SaveFailureBanner } from '@/components/save-failure-banner';
import { SpendRing } from '@/components/spend-ring';
import { useTranslations } from '@/i18n/locale-context';
import { monthFromUrl, monthLabel, monthNow, spendRing } from '@/lib/budget-month';
import { moneyOf } from '@/lib/money';
import {
  keepsTheFieldOpen,
  keepsTheKey,
  rereadsTheMonth,
  saveFailureKind,
  type SaveFailure,
} from '@/lib/save-failure';

interface Editing {
  categoryId: string;
  draft: string | null;
  key: string;
}

const STEP_MS = 500;

function mintKey(): string {
  return crypto.randomUUID();
}

export function BudgetMonth() {
  const { t, locale } = useTranslations();
  const pathname = usePathname();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();

  const budgets = useQuery(budgetsControllerListOptions());
  const budget = budgets.data?.find((candidate) => candidate.active) ?? null;

  const today = budget === null ? null : monthNow(budget.timezone);
  const month =
    today === null || budget === null
      ? null
      : monthFromUrl(params.get('month'), today, budget.firstMonth);

  const view = useQuery({
    ...budgetViewControllerReadOptions({ query: { month: month ?? '' } }),
    enabled: month !== null,
    placeholderData: keepPreviousData,
  });

  const [held, setHeld] = useState<typeof view.data>(undefined);
  const stepped = useRef(0);
  const waited = useRef(false);

  const waiting = view.data !== undefined && month !== null && view.data.month !== month;

  useEffect(() => {
    if (waiting) {
      waited.current = true;
    }
  }, [waiting]);

  useEffect(() => {
    if (view.data === undefined) return;

    if (held === undefined || held.month === view.data.month) {
      setHeld(view.data);
      return;
    }

    if (!waited.current) {
      setHeld(view.data);
      return;
    }

    const left = Math.max(0, STEP_MS - (Date.now() - stepped.current));
    const settle = setTimeout(() => setHeld(view.data), left);

    return () => clearTimeout(settle);
  }, [view.data, held]);

  const money = useMemo(
    () =>
      budget === null
        ? null
        : moneyOf(locale, budget.currency, budget.minorDigits, { signed: true }),
    [budget, locale],
  );

  const [editing, setEditing] = useState<Editing | null>(null);
  const [failure, setFailure] = useState<SaveFailure | null>(null);
  const [sent, setSent] = useState<CreateMoveDto | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const target = useRef<{ categoryId: string; categoryName: string } | null>(null);

  const shownData = held ?? view.data;
  const [turned, setTurned] = useState<{ month: string; forward: boolean }>({
    month: shownData?.month ?? '',
    forward: true,
  });

  if (shownData !== undefined && turned.month !== shownData.month) {
    setTurned((current) =>
      current.month === shownData.month
        ? current
        : { month: shownData.month, forward: shownData.month > current.month },
    );
  }

  const categories = (shownData?.groups ?? []).flatMap((group) => group.categories);
  const open = categories.find((candidate) => candidate.id === editing?.categoryId) ?? null;

  const reread = () => {
    const [named] = budgetViewControllerReadQueryKey({ query: { month: month ?? '' } });

    return queryClient.invalidateQueries({ queryKey: [{ _id: named._id }] });
  };

  const assign = useMutation({
    ...movesControllerMoveMutation(),
    onSuccess: async () => {
      setEditing(null);
      setFailure(null);
      setSent(null);
      await reread();
      setPending(null);
    },
    onError: async (error, variables) => {
      const kind = saveFailureKind(error);
      const wrote = target.current;

      setFailure({
        kind,
        categoryId: wrote?.categoryId ?? '',
        categoryName: wrote?.categoryName ?? '',
      });
      setSent(keepsTheKey(kind) ? variables.body : null);

      setEditing((current) =>
        current === null || !keepsTheFieldOpen(kind)
          ? null
          : keepsTheKey(kind)
            ? current
            : { categoryId: current.categoryId, draft: null, key: mintKey() },
      );

      if (rereadsTheMonth(kind)) {
        await reread();
      }

      setPending(null);
    },
  });

  const empty = budget === null || money === null || month === null || today === null || !shownData;

  if (budgets.isError) {
    return (
      <p role="alert" className="text-destructive text-sm">
        {t('categories.unavailable')}
      </p>
    );
  }

  if (view.isError && view.data === undefined) {
    return (
      <p role="alert" className="text-destructive text-sm">
        {t('categories.unavailable')}
      </p>
    );
  }

  if (empty) {
    return <BudgetMonthLoading />;
  }

  const behind = view.isError;
  const showing = shownData.month;
  const stepping: 'forward' | 'back' | null =
    showing === month ? null : month > showing ? 'forward' : 'back';

  const decimalOf = (minor: bigint): string =>
    toDecimalString(minor, money.digits).replace('.', money.marks.decimal);

  const draftOf = (categoryId: string, assigned: bigint): string =>
    editing?.categoryId === categoryId && editing.draft !== null
      ? editing.draft
      : decimalOf(assigned);

  const discard = (): void => {
    const outstanding = sent !== null;

    setEditing(null);
    setFailure(null);
    setSent(null);

    if (outstanding) {
      void reread();
    }
  };

  const drawerDraft = (): string => {
    if (open === null) return '';
    if (editing?.draft !== null && editing?.draft !== undefined) return editing.draft;

    const assigned = BigInt(open.assigned);

    return assigned === 0n ? '' : decimalOf(assigned);
  };

  const goToMonth = (next: CalendarMonth): void => {
    stepped.current = Date.now();
    waited.current = false;
    discard();
    window.history.pushState(null, '', `${pathname}?month=${next}`);
  };

  const commit = (): void => {
    if (editing === null || open === null || pending !== null || behind || stepping !== null)
      return;

    const assigned = BigInt(open.assigned);
    const amount = money.read(draftOf(open.id, assigned));
    if (amount.fault !== null || amount.minor === null) {
      setEditing(null);
      return;
    }

    const delta = amount.minor - assigned;
    if (delta === 0n) {
      setEditing(null);
      return;
    }

    const category = { kind: 'CATEGORY' as const, categoryId: open.id };
    const pool = { kind: 'READY_TO_ASSIGN' as const };

    setPending(open.id);
    target.current = { categoryId: open.id, categoryName: open.name };

    assign.mutate({
      body: {
        month,
        amount: (delta < 0n ? -delta : delta).toString(10),
        from: delta > 0n ? pool : category,
        to: delta > 0n ? category : pool,
        idempotencyKey: editing.key,
      },
    });
  };

  const cancel = (): void => {
    discard();
  };

  const bannerAction = async (): Promise<void> => {
    if (failure?.kind === 'network' && sent !== null) {
      setPending(failure.categoryId);
      target.current = { categoryId: failure.categoryId, categoryName: failure.categoryName };
      assign.mutate({ body: sent });
      return;
    }

    if (failure?.kind === 'budget') {
      setFailure(null);
      await queryClient.resetQueries();
      return;
    }

    setFailure(null);
  };

  const drawerOpen = isMobile && editing !== null;
  const failureInDrawer = drawerOpen && failure !== null;

  const editor = (categoryId: string, assigned: bigint) => ({
    editing: editing?.categoryId === categoryId && !isMobile,
    draft: draftOf(categoryId, assigned),
    saving: pending === categoryId,
    failed: failure?.categoryId === categoryId,
    onOpen: () => {
      if (pending !== null || behind || stepping !== null) return;

      discard();
      setEditing({ categoryId, draft: null, key: mintKey() });
    },
    onDraft: (value: string) =>
      setEditing((current) => (current === null ? current : { ...current, draft: value })),
    onCommit: commit,
    onCancel: cancel,
  });

  if (shownData.groups.length === 0) {
    return (
      <div className="flex h-full items-center justify-center rounded-xl border border-dashed p-6">
        <div className="flex max-w-sm flex-col items-center gap-3 text-center">
          <div className="bg-muted text-muted-foreground flex size-12 items-center justify-center rounded-full">
            <IconWallet className="size-5" />
          </div>
          <p className="text-base font-semibold">{t('categories.emptyTitle')}</p>
          <p className="text-muted-foreground text-sm">{t('categories.emptyBody')}</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {behind ? (
        <p role="alert" className="text-destructive mb-4 text-sm">
          {t('categories.unavailable')}
        </p>
      ) : null}

      <BudgetMonthHeader
        month={showing}
        stepping={stepping}
        floating={drawerOpen}
        today={today}
        first={budget.firstMonth}
        readyToAssign={BigInt(shownData.readyToAssign)}
        money={money}
        onMonth={goToMonth}
      />

      {failure === null || failureInDrawer ? null : (
        <SaveFailureBanner failure={failure} onAction={bannerAction} onCancel={cancel} />
      )}

      <div className="overflow-x-clip">
        <div
          key={showing}
          className={cn(
            'flex flex-col gap-5.5',
            turned.forward
              ? 'motion-safe:animate-page-in-right'
              : 'motion-safe:animate-page-in-left',
          )}
        >
          {shownData.groups.map((group) => (
            <CategoryGroup
              key={group.id}
              id={group.id}
              name={group.name}
              available={money.format(
                group.categories.reduce((total, one) => total + BigInt(one.available), 0n),
              )}
            >
              {group.categories.map((category) => (
                <CategoryTile
                  key={category.id}
                  category={category}
                  money={money}
                  {...editor(category.id, BigInt(category.assigned))}
                />
              ))}
            </CategoryGroup>
          ))}
        </div>
      </div>

      <Drawer open={drawerOpen} onOpenChange={(next) => (next ? null : cancel())}>
        <DrawerContent>
          <DrawerHeader className="flex-row items-center gap-3 pb-0">
            {open === null ? null : (
              <SpendRing
                icon={open.icon}
                color={open.color}
                fraction={spendRing(BigInt(open.activity), BigInt(open.available)).fraction}
                overspent={BigInt(open.available) < 0n}
                size={68}
              />
            )}
            <span className="flex flex-col items-start gap-0.5">
              <DrawerTitle className="text-2xl leading-tight font-semibold">
                {open?.name ?? ''}
              </DrawerTitle>
              <span className="text-muted-foreground text-[15px] leading-tight">
                {monthLabel(showing, locale)}
              </span>
            </span>
          </DrawerHeader>

          <div className="flex flex-col px-4 pt-4">
            <label className="text-muted-foreground text-[15px]" htmlFor="assign-amount">
              {t('categories.assignFieldShort')}
            </label>
            <input
              id="assign-amount"
              type="text"
              inputMode="decimal"
              aria-label={t('categories.assignField')}
              autoFocus
              placeholder={decimalOf(0n)}
              value={drawerDraft()}
              disabled={pending !== null}
              onChange={(event) =>
                setEditing((current) =>
                  current === null ? current : { ...current, draft: event.target.value },
                )
              }
              className={cn(
                'bg-input/50 mt-2 h-13 w-full rounded-full border border-transparent px-4',
                'placeholder:text-muted-foreground text-xl font-medium tabular-nums outline-none',
                'transition-colors',
                'focus:border-ring focus:ring-ring/30 focus:ring-3 disabled:opacity-50',
              )}
            />

            <div className="text-muted-foreground flex justify-between gap-3 px-0.5 pt-3 text-[15px]">
              <span className="flex items-baseline gap-1.5">
                <span>{t('categories.available')}</span>
                <span className="text-foreground font-medium tabular-nums">
                  {open === null ? '' : money.format(BigInt(open.available))}
                </span>
              </span>
              <span className="flex items-baseline gap-1.5">
                <span>
                  {t(
                    open !== null && BigInt(open.activity) > 0n
                      ? 'categories.incoming'
                      : 'categories.spent',
                  )}
                </span>
                <span className="text-foreground font-medium tabular-nums">
                  {open === null
                    ? ''
                    : money.format(spendRing(BigInt(open.activity), BigInt(open.available)).moved)}
                </span>
              </span>
            </div>
          </div>

          {failureInDrawer ? (
            <div className="px-4 pt-3">
              <SaveFailureBanner failure={failure} onAction={bannerAction} onCancel={cancel} />
            </div>
          ) : null}

          <DrawerFooter className="flex-row gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              className="h-11 flex-1 rounded-[22px]"
              onClick={cancel}
            >
              {t('categories.assignCancel')}
            </Button>
            <Button type="button" className="h-11 flex-1 rounded-[22px]" onClick={commit}>
              {t('categories.assignSave')}
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
