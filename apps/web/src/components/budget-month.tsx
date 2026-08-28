'use client';

import { type CreateMoveDto } from '@rondo/api-client';
import {
  budgetViewControllerReadOptions,
  budgetViewControllerReadQueryKey,
  budgetsControllerListOptions,
  movesControllerMoveMutation,
} from '@rondo/api-client/react-query';
import { parseMoney, toDecimalString, type CalendarMonth } from '@rondo/types';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@rondo/ui/components/ui/drawer';
import { useIsMobile } from '@rondo/ui/hooks/use-mobile';
import { cn } from '@rondo/ui/lib/utils';
import { IconWallet } from '@tabler/icons-react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { BudgetMonthHeader } from '@/components/budget-month-header';
import { BudgetMonthLoading } from '@/components/budget-month-loading';
import { CategoryGroup } from '@/components/category-group';
import { CategoryTile } from '@/components/category-tile';
import { MoveFields } from '@/components/move-fields';
import { SaveFailureBanner } from '@/components/save-failure-banner';
import { SpendRing } from '@/components/spend-ring';
import { useTranslations } from '@/i18n/locale-context';
import { monthFromUrl, monthLabel, monthNow, spendRing } from '@/lib/budget-month';
import { moneyOf } from '@/lib/money';
import { moveTargets, POOL, type MoveTarget } from '@/lib/move-target';
import {
  keepsTheKey,
  keepsThePopoverOpen,
  rereadsTheMonth,
  saveFailureKind,
  type SaveFailure,
} from '@/lib/save-failure';

interface Moving {
  categoryId: string;
  month: CalendarMonth;
  otherId: string;
  outgoing: boolean;
  draft: string;
  query: string;
  picking: boolean;
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

  const [moving, setMoving] = useState<Moving | null>(null);
  const [failure, setFailure] = useState<SaveFailure | null>(null);
  const [sent, setSent] = useState<CreateMoveDto | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [settling, setSettling] = useState(false);
  const reading = useRef(false);
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

  if (moving !== null && month !== null && moving.month !== month) {
    setMoving(null);
  }

  const categories = (shownData?.groups ?? []).flatMap((group) => group.categories);
  const moved = categories.find((candidate) => candidate.id === moving?.categoryId) ?? null;

  const reread = () => {
    const [named] = budgetViewControllerReadQueryKey({ query: { month: month ?? '' } });

    return queryClient.invalidateQueries({ queryKey: [{ _id: named._id }] });
  };

  const assign = useMutation({
    ...movesControllerMoveMutation(),
    onSuccess: async () => {
      setMoving(null);
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

      setMoving((current) =>
        current === null || !keepsThePopoverOpen(kind)
          ? null
          : keepsTheKey(kind)
            ? current
            : { ...current, key: mintKey() },
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

  const discard = (): void => {
    const outstanding = sent !== null;

    setMoving(null);
    setFailure(null);
    setSent(null);

    if (outstanding) {
      reading.current = true;
      setSettling(true);
      void reread().finally(() => {
        reading.current = false;
        setSettling(false);
      });
    }
  };

  const goToMonth = (next: CalendarMonth): void => {
    stepped.current = Date.now();
    waited.current = false;
    discard();
    window.history.pushState(null, '', `${pathname}?month=${next}`);
  };

  const moveShape =
    moving === null || moved === null
      ? null
      : {
          groups: shownData.groups,
          readyToAssign: parseMoney(shownData.readyToAssign),
          poolName: t('categories.readyToAssign'),
        };

  const envelopeOf = (id: string): MoveTarget => {
    const pool: MoveTarget = {
      id: POOL,
      name: t('categories.readyToAssign'),
      available: parseMoney(shownData.readyToAssign),
      icon: null,
      color: null,
    };

    if (moveShape === null) return pool;

    return (
      moveTargets({ ...moveShape, except: '', query: '' }).find((one) => one.id === id) ?? pool
    );
  };

  const moveAnchor = moved === null ? null : envelopeOf(moved.id);
  const moveOther = moving === null ? null : envelopeOf(moving.otherId);
  const moveFrom = moving === null ? null : moving.outgoing ? moveAnchor : moveOther;
  const moveTo = moving === null ? null : moving.outgoing ? moveOther : moveAnchor;

  const sideOf = (envelope: MoveTarget) =>
    envelope.id === POOL
      ? { kind: 'READY_TO_ASSIGN' as const }
      : { kind: 'CATEGORY' as const, categoryId: envelope.id };

  const commitMove = (): void => {
    if (
      moving === null ||
      moved === null ||
      moveFrom === null ||
      moveTo === null ||
      pending !== null ||
      sent !== null ||
      settling ||
      reading.current ||
      behind ||
      stepping !== null
    )
      return;

    const amount = money.read(moving.draft);
    if (amount.partial || amount.fault !== null || amount.minor === null || amount.minor <= 0n) {
      return;
    }

    setPending(moved.id);
    target.current = { categoryId: moved.id, categoryName: moved.name };

    assign.mutate({
      body: {
        month,
        amount: amount.minor.toString(10),
        from: sideOf(moveFrom),
        to: sideOf(moveTo),
        idempotencyKey: moving.key,
      },
    });
  };

  const openMove = (categoryId: string): void => {
    if (
      pending !== null ||
      sent !== null ||
      settling ||
      reading.current ||
      behind ||
      stepping !== null
    )
      return;

    const opened = categories.find((candidate) => candidate.id === categoryId);
    const available = opened === undefined ? 0n : parseMoney(opened.available);

    discard();
    setMoving({
      categoryId,
      month,
      otherId: POOL,
      outgoing: available > 0n,
      draft: available === 0n ? '' : decimalOf(available < 0n ? -available : available),
      query: '',
      picking: false,
      key: mintKey(),
    });
  };

  const swapMove = (): void =>
    setMoving((current) =>
      current === null ? current : { ...current, outgoing: !current.outgoing },
    );

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

  const moveDrawerOpen = isMobile && moving !== null && moved !== null;
  const moveDialogOpen = !isMobile && moving !== null && moved !== null;
  const failureInSurface = failure !== null && (moveDrawerOpen || moveDialogOpen);

  const notice =
    failure === null ? null : (
      <SaveFailureBanner
        failure={failure}
        className="mb-0"
        onAction={bannerAction}
        onCancel={cancel}
      />
    );

  const movePanel = (): ReactNode => {
    if (
      moving === null ||
      moved === null ||
      moveShape === null ||
      moveAnchor === null ||
      moveOther === null
    )
      return null;

    return (
      <MoveFields
        category={moveAnchor}
        other={moveOther}
        targets={moveTargets({ ...moveShape, except: moved.id, query: moving.query })}
        outgoing={moving.outgoing}
        assigning={!moving.outgoing && moveOther.id === POOL}
        picking={moving.picking}
        draft={moving.draft}
        query={moving.query}
        saving={pending !== null}
        frozen={sent !== null || behind || stepping !== null}
        money={money}
        notice={failureInSurface ? notice : null}
        large={isMobile}
        onDraft={(value) =>
          setMoving((current) => (current === null ? current : { ...current, draft: value }))
        }
        onQuery={(value) =>
          setMoving((current) => (current === null ? current : { ...current, query: value }))
        }
        onPicking={(open) =>
          setMoving((current) =>
            current === null ? current : { ...current, picking: open, query: '' },
          )
        }
        onChoose={(target) =>
          setMoving((current) =>
            current === null
              ? current
              : { ...current, otherId: target.id, picking: false, query: '' },
          )
        }
        onSwap={swapMove}
        onCommit={commitMove}
        onCancel={cancel}
      />
    );
  };

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
        floating={moveDrawerOpen || moveDialogOpen}
        today={today}
        first={budget.firstMonth}
        readyToAssign={parseMoney(shownData.readyToAssign)}
        money={money}
        onMonth={goToMonth}
      />

      {failure === null || failureInSurface ? null : (
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
                group.categories.reduce((total, one) => total + parseMoney(one.available), 0n),
              )}
            >
              {group.categories.map((category) => (
                <CategoryTile
                  key={category.id}
                  category={category}
                  money={money}
                  moveOpen={moveDialogOpen && moving?.categoryId === category.id}
                  movePanel={moving?.categoryId === category.id ? movePanel() : null}
                  moveInPopover={!isMobile}
                  onMoveOpen={() => openMove(category.id)}
                  onMoveClose={cancel}
                  failed={failure?.categoryId === category.id}
                />
              ))}
            </CategoryGroup>
          ))}
        </div>
      </div>

      <Drawer open={moveDrawerOpen} onOpenChange={(next) => (next ? null : cancel())}>
        <DrawerContent>
          <DrawerHeader className="flex-row items-center gap-3 pb-0">
            {moved === null ? null : (
              <SpendRing
                icon={moved.icon}
                color={moved.color}
                fraction={
                  spendRing(parseMoney(moved.activity), parseMoney(moved.available)).fraction
                }
                overspent={parseMoney(moved.available) < 0n}
                size={68}
              />
            )}
            <span className="flex flex-col items-start gap-0.5">
              <DrawerTitle className="text-2xl leading-tight font-semibold">
                {moved?.name ?? ''}
              </DrawerTitle>
              <span className="text-muted-foreground text-[15px] leading-tight">
                {monthLabel(showing, locale)}
              </span>
            </span>
          </DrawerHeader>

          <div className="p-4">{movePanel()}</div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
