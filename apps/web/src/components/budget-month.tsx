'use client';

import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { type CreateMoveDto } from '@rondo/api-client';
import {
  budgetViewControllerReadOptions,
  budgetViewControllerReadQueryKey,
  budgetsControllerListOptions,
  categoriesControllerCreateMutation,
  categoriesControllerHideMutation,
  categoriesControllerReorderMutation,
  categoriesControllerUpdateMutation,
  categoryGroupsControllerCreateMutation,
  categoryGroupsControllerHideMutation,
  categoryGroupsControllerReorderMutation,
  categoryGroupsControllerUpdateMutation,
  categoryPaidControllerMarkMutation,
  categoryPaidControllerUnmarkMutation,
  categoryTargetsControllerCloseMutation,
  categoryTargetsControllerSetMutation,
  movesControllerMoveMutation,
} from '@rondo/api-client/react-query';
import { parseMoney, type CalendarMonth } from '@rondo/types';
import { Button } from '@rondo/ui/components/ui/button';
import { Card, CardContent } from '@rondo/ui/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@rondo/ui/components/ui/dialog';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@rondo/ui/components/ui/drawer';
import { useIsMobile } from '@rondo/ui/hooks/use-mobile';
import { cn } from '@rondo/ui/lib/utils';
import { IconPlus, IconWallet } from '@tabler/icons-react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { BudgetMonthHeader } from '@/components/budget-month-header';
import { BudgetMonthLoading } from '@/components/budget-month-loading';
import { CategoryActions } from '@/components/category-actions';
import { CategoryDialog } from '@/components/category-dialog';
import { CategoryGroup } from '@/components/category-group';
import { CategoryTile } from '@/components/category-tile';
import { GroupDialog } from '@/components/group-dialog';
import { HideCategoryDialog } from '@/components/hide-category-dialog';
import { HideGroupDialog } from '@/components/hide-group-dialog';
import { MoveFields } from '@/components/move-fields';
import { PaidDialog } from '@/components/paid-dialog';
import { SaveFailureBanner } from '@/components/save-failure-banner';
import { SpendRing } from '@/components/spend-ring';
import { TargetDialog } from '@/components/target-dialog';
import { TargetPanel } from '@/components/target-panel';
import { useTranslations } from '@/i18n/locale-context';
import type { MessageKey } from '@/i18n/messages';
import { categoryRing, monthFromUrl, monthLabel, monthNow } from '@/lib/budget-month';
import { categoryFailure } from '@/lib/category-failure';
import {
  reordered,
  reorderedGroups,
  reorderedView,
  shownOrder,
  storedOrder,
} from '@/lib/category-order';
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

type Managing =
  | { kind: 'newGroup' }
  | { kind: 'editGroup'; groupId: string }
  | { kind: 'newCategory'; groupId: string }
  | { kind: 'editCategory'; categoryId: string }
  | { kind: 'hideCategory'; categoryId: string }
  | { kind: 'hideGroup'; groupId: string }
  | { kind: 'goal'; categoryId: string }
  | { kind: 'paid'; categoryId: string };

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
  const groupSensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

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
  const [managing, setManaging] = useState<Managing | null>(null);
  const [refused, setRefused] = useState<MessageKey | null>(null);
  const [failure, setFailure] = useState<SaveFailure | null>(null);
  const [sent, setSent] = useState<CreateMoveDto | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [settling, setSettling] = useState(false);
  const reading = useRef(false);
  const target = useRef<{ categoryId: string; categoryName: string } | null>(null);
  const swept = useRef<{ categoryId: string; categoryName: string } | null>(null);
  const intents = useRef(new Map<string, string>());

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

  const belowZero = (one: { available: string }): boolean => parseMoney(one.available) < 0n;
  const overspentCount = categories.filter(belowZero).length;
  const filtering = params.get('overspent') === '1' && overspentCount > 0;

  const movedRing = moved === null ? null : categoryRing(moved);
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

  const closeManaging = (): void => {
    setRefused(null);
    setManaging(null);
  };

  const emptyIntoPool = (categoryId: string, categoryName: string, amount: bigint): void => {
    if (amount === 0n || month === null) return;

    swept.current = { categoryId, categoryName };

    const envelope = { kind: 'CATEGORY' as const, categoryId };
    const pool = { kind: 'READY_TO_ASSIGN' as const };
    const outgoing = amount > 0n;

    sweep.mutate({
      body: {
        month,
        amount: (outgoing ? amount : -amount).toString(10),
        from: outgoing ? envelope : pool,
        to: outgoing ? pool : envelope,
        idempotencyKey: keyFor(`release:${categoryId}`),
      },
    });
  };

  const managed = {
    onSuccess: async () => {
      closeManaging();
      await reread();
    },
    onError: (error: unknown) => setRefused(categoryFailure(error)),
  };

  const createCategory = useMutation({ ...categoriesControllerCreateMutation(), ...managed });
  const editCategory = useMutation({ ...categoriesControllerUpdateMutation(), ...managed });
  const hideCategory = useMutation({ ...categoriesControllerHideMutation(), ...managed });
  const hideGroup = useMutation({ ...categoryGroupsControllerHideMutation(), ...managed });
  const createGroup = useMutation({ ...categoryGroupsControllerCreateMutation(), ...managed });
  const editGroup = useMutation({ ...categoryGroupsControllerUpdateMutation(), ...managed });
  const sweep = useMutation({
    ...movesControllerMoveMutation(),
    onSettled: () => reread(),
    onError: (error) => {
      if (managing !== null) {
        setRefused(categoryFailure(error));
        return;
      }

      setFailure({
        kind: saveFailureKind(error),
        categoryId: swept.current?.categoryId ?? '',
        categoryName: swept.current?.categoryName ?? '',
      });
    },
  });

  const setGoal = useMutation({ ...categoryTargetsControllerSetMutation(), ...managed });
  const closeGoal = useMutation({ ...categoryTargetsControllerCloseMutation(), ...managed });

  const reorderCategories = useMutation({
    ...categoriesControllerReorderMutation(),
    onError: () => setFailure({ kind: 'other', categoryId: '', categoryName: '' }),
    onSettled: () => reread(),
  });

  const reorderGroups = useMutation({
    ...categoryGroupsControllerReorderMutation(),
    onError: () => setFailure({ kind: 'other', categoryId: '', categoryName: '' }),
    onSettled: () => reread(),
  });

  const markPaid = useMutation({ ...categoryPaidControllerMarkMutation(), ...managed });
  const unmarkPaid = useMutation({
    ...categoryPaidControllerUnmarkMutation(),
    onSuccess: (_, variables) => {
      intents.current.delete(`unpaid:${variables.path.id}:${variables.body.month}`);
    },
    onSettled: () => reread(),
    onError: (error, variables) => {
      const reopened = categories.find((one) => one.id === variables.path.id);

      setFailure({
        kind: saveFailureKind(error),
        categoryId: variables.path.id,
        categoryName: reopened?.name ?? '',
      });
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

  const manage = (next: Managing): void => {
    discard();
    intents.current = new Map();
    setRefused(null);
    setManaging(next);
  };

  const keyFor = (intent: string): string => {
    const held = intents.current.get(intent);
    if (held !== undefined) {
      return held;
    }

    const minted = mintKey();
    intents.current.set(intent, minted);

    return minted;
  };

  const goToMonth = (next: CalendarMonth): void => {
    stepped.current = Date.now();
    waited.current = false;
    discard();
    window.history.pushState(null, '', `${pathname}?month=${next}`);
  };

  const setFilter = (on: boolean): void => {
    discard();
    window.history.pushState(null, '', `${pathname}?month=${month}${on ? '&overspent=1' : ''}`);
  };

  const moveShape =
    moving === null || moved === null
      ? null
      : {
          groups: shownData.groups,
          readyToAssign: parseMoney(shownData.readyToAssign),
          poolName: t('categories.readyToAssign'),
        };

  const envelopeOf = (id: string): MoveTarget | null =>
    moveShape === null
      ? null
      : (moveTargets({ ...moveShape, except: '', query: '' }).find((one) => one.id === id) ?? null);

  const moveAnchor = moved === null ? null : envelopeOf(moved.id);
  const moveOther = moving === null ? null : envelopeOf(moving.otherId);
  const moveFrom = moving === null ? null : moving.outgoing ? moveAnchor : moveOther;
  const moveTo = moving === null ? null : moving.outgoing ? moveOther : moveAnchor;

  const sendableMinor = (draft: string): bigint | null => {
    const amount = money.read(draft);

    return amount.partial || amount.fault !== null || amount.minor === null || amount.minor <= 0n
      ? null
      : amount.minor;
  };

  const moveMinor = moving === null ? null : sendableMinor(moving.draft);

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
      moveMinor === null ||
      pending !== null ||
      sent !== null ||
      settling ||
      reading.current ||
      behind ||
      stepping !== null
    )
      return;

    setPending(moved.id);
    target.current = { categoryId: moved.id, categoryName: moved.name };

    assign.mutate({
      body: {
        month,
        amount: moveMinor.toString(10),
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
    const asked = opened?.target?.needed === undefined ? 0n : parseMoney(opened.target.needed);

    discard();
    setMoving({
      categoryId,
      month,
      otherId: POOL,
      outgoing: asked > 0n ? false : available > 0n,
      draft:
        asked > 0n
          ? money.typed(asked)
          : available === 0n
            ? ''
            : money.typed(available < 0n ? -available : available),
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

  const moveReady = moving !== null && moved !== null && moveAnchor !== null && moveOther !== null;
  const moveDrawerOpen = isMobile && moveReady;
  const moveDialogOpen = !isMobile && moveReady;
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
        ready={moveMinor !== null}
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

  const goalCard = (shown: (typeof categories)[number] | null): ReactNode => {
    const goal = shown?.target ?? null;

    if (shown === null || goal === null) return null;

    return (
      <>
        <div aria-hidden className="bg-border/60 h-px w-full" />
        <Card size="sm" className="bg-muted shadow-none ring-0 dark:ring-0">
          <CardContent>
            <TargetPanel target={goal} money={money} color={shown.color} />
          </CardContent>
        </Card>
      </>
    );
  };

  const managePanel = (categoryId: string): ReactNode => {
    const shown = categories.find((one) => one.id === categoryId);
    if (!shown) return null;

    return (
      <CategoryActions
        category={shown}
        currentMonth={showing === today}
        onEdit={() => manage({ kind: 'editCategory', categoryId })}
        onHide={() => manage({ kind: 'hideCategory', categoryId })}
        onGoal={() => manage({ kind: 'goal', categoryId })}
        onPaid={() =>
          shown.paid
            ? unmarkPaid.mutate({
                path: { id: categoryId },
                body: { month, idempotencyKey: keyFor(`unpaid:${categoryId}:${month}`) },
              })
            : manage({ kind: 'paid', categoryId })
        }
      />
    );
  };

  const managedCategory =
    managing !== null && 'categoryId' in managing
      ? (categories.find((one) => one.id === managing.categoryId) ?? null)
      : null;

  const managedGroup =
    managing !== null && 'groupId' in managing
      ? (shownData.groups.find((one) => one.id === managing.groupId) ?? null)
      : null;

  const groupOf = (categoryId: string): { id: string; name: string } | null =>
    shownData.groups.find((one) => one.categories.some((each) => each.id === categoryId)) ?? null;

  const groupList = shownData.groups.map((one) => ({ id: one.id, name: one.name }));

  const manageDialog = (): ReactNode => {
    if (managing === null) return null;

    if (managing.kind === 'newGroup' || managing.kind === 'editGroup') {
      const renaming = managing.kind === 'editGroup' ? managedGroup : null;

      return (
        <GroupDialog
          group={renaming}
          failed={refused}
          busy={createGroup.isPending || editGroup.isPending}
          onCancel={closeManaging}
          onSave={(draft) =>
            renaming === null
              ? createGroup.mutate({ body: draft })
              : editGroup.mutate({ path: { id: renaming.id }, body: draft })
          }
        />
      );
    }

    if (managing.kind === 'newCategory' || managing.kind === 'editCategory') {
      const editing =
        managing.kind === 'newCategory' || managedCategory === null
          ? null
          : {
              id: managedCategory.id,
              name: managedCategory.name,
              groupId: groupOf(managedCategory.id)?.id ?? '',
              icon: managedCategory.icon,
              color: managedCategory.color,
            };

      return (
        <CategoryDialog
          category={editing}
          failed={refused}
          groupId={managing.kind === 'newCategory' ? managing.groupId : (editing?.groupId ?? '')}
          groups={groupList}
          onCancel={closeManaging}
          onSave={(draft) =>
            editing === null
              ? createCategory.mutate({
                  body: {
                    groupId: draft.groupId,
                    name: draft.name,
                    ...(draft.icon === null ? {} : { icon: draft.icon }),
                    ...(draft.color === null ? {} : { color: draft.color }),
                    idempotencyKey: draft.idempotencyKey,
                  },
                })
              : editCategory.mutate({
                  path: { id: editing.id },
                  body: {
                    groupId: draft.groupId,
                    name: draft.name,
                    ...(draft.icon === null ? {} : { icon: draft.icon }),
                    ...(draft.color === null ? {} : { color: draft.color }),
                    idempotencyKey: draft.idempotencyKey,
                  },
                })
          }
        />
      );
    }

    if (managing.kind === 'hideCategory' && managedCategory !== null) {
      return (
        <HideCategoryDialog
          category={{
            id: managedCategory.id,
            name: managedCategory.name,
            available: parseMoney(managedCategory.available),
            availableAllTime: parseMoney(managedCategory.availableAllTime),
          }}
          money={money}
          failed={refused}
          busy={sweep.isPending || hideCategory.isPending}
          onCancel={closeManaging}
          onMoveOut={() =>
            emptyIntoPool(
              managedCategory.id,
              managedCategory.name,
              parseMoney(managedCategory.availableAllTime),
            )
          }
          onHide={() =>
            hideCategory.mutate({
              path: { id: managedCategory.id },
              body: { idempotencyKey: keyFor('hide') },
            })
          }
        />
      );
    }

    if (managing.kind === 'goal' && managedCategory !== null) {
      const goal = managedCategory.target ?? null;

      return (
        <TargetDialog
          category={{ id: managedCategory.id, name: managedCategory.name }}
          target={goal}
          month={month}
          money={money}
          failed={refused}
          busy={setGoal.isPending || closeGoal.isPending}
          onCancel={closeManaging}
          onSave={(draft) => {
            if (draft.kind === null) {
              if (goal === null) {
                closeManaging();
                return;
              }

              closeGoal.mutate({
                path: { id: managedCategory.id },
                body: { idempotencyKey: draft.idempotencyKey },
              });
              return;
            }

            setGoal.mutate({
              path: { id: managedCategory.id },
              body: {
                kind: draft.kind,
                amount: draft.amount,
                ...(draft.dueMonth === null ? {} : { dueMonth: draft.dueMonth }),
                idempotencyKey: draft.idempotencyKey,
              },
            });
          }}
        />
      );
    }

    if (managing.kind === 'paid' && managedCategory !== null) {
      return (
        <PaidDialog
          category={{ id: managedCategory.id, name: managedCategory.name }}
          failed={refused}
          busy={markPaid.isPending}
          onCancel={closeManaging}
          onConfirm={() =>
            markPaid.mutate({
              path: { id: managedCategory.id },
              body: { month, idempotencyKey: keyFor('paid') },
            })
          }
        />
      );
    }

    if (managing.kind === 'hideGroup' && managedGroup !== null) {
      return (
        <HideGroupDialog
          group={{
            id: managedGroup.id,
            name: managedGroup.name,
            categories: managedGroup.categories.map((one) => ({
              id: one.id,
              name: one.name,
              availableAllTime: parseMoney(one.availableAllTime),
            })),
          }}
          money={money}
          failed={refused}
          busy={sweep.isPending || hideGroup.isPending}
          onCancel={closeManaging}
          onMoveOut={(categoryId) => {
            const one = managedGroup.categories.find((each) => each.id === categoryId);

            if (one) {
              emptyIntoPool(one.id, one.name, parseMoney(one.availableAllTime));
            }
          }}
          onHide={() =>
            hideGroup.mutate({
              path: { id: managedGroup.id },
              body: { idempotencyKey: keyFor('hide') },
            })
          }
        />
      );
    }

    return null;
  };

  const reorder = (groupId: string, shownIds: string[]): void => {
    const group = shownData.groups.find((one) => one.id === groupId);
    if (group === undefined) return;

    const paid = new Set(group.categories.filter((one) => one.paid).map((one) => one.id));
    const categoryIds = storedOrder(
      group.categories.map((one) => one.id),
      paid,
      shownIds,
    );
    const key = budgetViewControllerReadQueryKey({ query: { month } });

    queryClient.setQueryData(key, (current: typeof shownData) =>
      current === undefined ? current : reorderedView(current, groupId, categoryIds),
    );
    setHeld((current) =>
      current === undefined ? current : reorderedView(current, groupId, categoryIds),
    );

    reorderCategories.mutate({ body: { groupId, categoryIds, idempotencyKey: mintKey() } });
  };

  const groupIds = shownData.groups.map((one) => one.id);

  const groupDropped = (event: DragEndEvent): void => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const from = groupIds.indexOf(String(active.id));
    const to = groupIds.indexOf(String(over.id));
    if (from < 0 || to < 0) return;

    const next = reordered(groupIds, from, to);
    const key = budgetViewControllerReadQueryKey({ query: { month } });

    queryClient.setQueryData(key, (current: typeof shownData) =>
      current === undefined ? current : reorderedGroups(current, next),
    );
    setHeld((current) => (current === undefined ? current : reorderedGroups(current, next)));

    reorderGroups.mutate({ body: { groupIds: next, idempotencyKey: mintKey() } });
  };

  const shownGroups = filtering
    ? shownData.groups.flatMap((group) => {
        const kept = group.categories.filter(belowZero);

        return kept.length === 0 ? [] : [{ ...group, categories: kept }];
      })
    : shownData.groups;

  const totalOf = (groupId: string): bigint =>
    (shownData.groups.find((one) => one.id === groupId)?.categories ?? []).reduce(
      (total, one) => total + parseMoney(one.available),
      0n,
    );

  const addGroup = (
    <div className="mt-5.5 flex justify-end">
      <Button
        type="button"
        variant="outline"
        onClick={() => manage({ kind: 'newGroup' })}
        className="h-8 rounded-2xl px-3"
      >
        <IconPlus aria-hidden className="size-4" />
        {t('categories.addGroup')}
      </Button>
    </div>
  );

  const nothingYet = (
    <div className="flex items-center justify-center rounded-xl border border-dashed p-6">
      <div className="flex max-w-sm flex-col items-center gap-3 text-center">
        <div className="bg-muted text-muted-foreground flex size-12 items-center justify-center rounded-full">
          <IconWallet className="size-5" />
        </div>
        <p className="text-base font-semibold">{t('categories.emptyTitle')}</p>
        <p className="text-muted-foreground text-sm">{t('categories.emptyBody')}</p>
      </div>
    </div>
  );

  return (
    <div>
      {behind ? (
        <p role="alert" className="text-destructive mb-4 text-sm">
          {t('categories.unavailable')}
        </p>
      ) : null}

      <BudgetMonthHeader
        covered={managing !== null}
        month={showing}
        stepping={stepping}
        floating={moveDrawerOpen || moveDialogOpen}
        today={today}
        first={budget.firstMonth}
        readyToAssign={parseMoney(shownData.readyToAssign)}
        money={money}
        overspent={overspentCount}
        filtering={filtering}
        onMonth={goToMonth}
        onFilter={setFilter}
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
          {shownData.groups.length === 0 ? nothingYet : null}

          <DndContext
            sensors={groupSensors}
            collisionDetection={closestCenter}
            onDragEnd={groupDropped}
          >
            <SortableContext items={groupIds} strategy={verticalListSortingStrategy}>
              {shownGroups.map((group) => (
                <CategoryGroup
                  key={group.id}
                  id={group.id}
                  name={group.name}
                  available={money.format(totalOf(group.id))}
                  sortable={!filtering}
                  onAdd={() => manage({ kind: 'newCategory', groupId: group.id })}
                  onRename={() => manage({ kind: 'editGroup', groupId: group.id })}
                  onHide={() => manage({ kind: 'hideGroup', groupId: group.id })}
                  onReorder={(categoryIds) => reorder(group.id, categoryIds)}
                  categoryIds={shownOrder(group.categories).map((one) => one.id)}
                >
                  {shownOrder(group.categories).map((category) => (
                    <CategoryTile
                      key={category.id}
                      category={category}
                      money={money}
                      attention={filtering}
                      sortable={!filtering}
                      moveOpen={moveDialogOpen && moving?.categoryId === category.id}
                      movePanel={
                        moving?.categoryId === category.id ? (
                          <>
                            {movePanel()}
                            {goalCard(category)}
                            {managePanel(category.id)}
                          </>
                        ) : null
                      }
                      moveInPopover={!isMobile}
                      onMoveOpen={() => openMove(category.id)}
                      onMoveClose={cancel}
                      failed={failure?.categoryId === category.id}
                    />
                  ))}
                </CategoryGroup>
              ))}
            </SortableContext>
          </DndContext>

          {addGroup}
        </div>
      </div>

      <Drawer open={moveDrawerOpen} onOpenChange={(next) => (next ? null : cancel())}>
        <DrawerContent>
          <DrawerHeader className="flex-row items-center gap-3 pb-0">
            {moved === null || movedRing === null ? null : (
              <SpendRing
                icon={moved.icon}
                color={moved.color}
                fill={movedRing.fill}
                head={movedRing.head}
                goalShare={movedRing.goalShare}
                overspent={movedRing.overspent}
                size={68}
              />
            )}
            <span className="flex flex-col items-start gap-0.5">
              <DrawerTitle className="text-xl leading-tight font-semibold">
                {moved?.name ?? ''}
              </DrawerTitle>
              <span className="text-muted-foreground text-[13px] leading-tight">
                {monthLabel(showing, locale)}
              </span>
            </span>
          </DrawerHeader>

          <div
            className={cn(
              'flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto overscroll-contain p-4',
              '[&>*]:shrink-0',
            )}
          >
            {movePanel()}
            {goalCard(moved)}
            {moved === null ? null : managePanel(moved.id)}
          </div>
        </DrawerContent>
      </Drawer>

      <Dialog open={managing !== null} onOpenChange={(next) => (next ? null : closeManaging())}>
        <DialogContent className="max-h-[85dvh] gap-0 overflow-x-hidden overflow-y-auto rounded-[24px] p-6 sm:max-w-[480px]">
          <DialogTitle className="sr-only">{t('categories.dialogTitle')}</DialogTitle>
          <DialogDescription className="sr-only">{t('categories.manage')}</DialogDescription>
          {manageDialog()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
