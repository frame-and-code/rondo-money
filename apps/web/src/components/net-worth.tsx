'use client';

import {
  assetsControllerChangeMutation,
  assetsControllerCreateMutation,
  assetsControllerRemoveMutation,
  budgetsControllerListOptions,
  liabilitiesControllerChangeMutation,
  liabilitiesControllerCreateMutation,
  liabilitiesControllerRemoveMutation,
  netWorthControllerReadOptions,
  netWorthControllerReadQueryKey,
} from '@rondo/api-client/react-query';
import { parseMoney, todayIn, type AccountType } from '@rondo/types';
import { Button } from '@rondo/ui/components/ui/button';
import { Card } from '@rondo/ui/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@rondo/ui/components/ui/dialog';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@rondo/ui/components/ui/drawer';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@rondo/ui/components/ui/dropdown-menu';
import { Item, ItemContent, ItemMedia, ItemTitle } from '@rondo/ui/components/ui/item';
import { useIsMobile } from '@rondo/ui/hooks/use-mobile';
import {
  IconCash,
  IconCreditCard,
  IconDots,
  IconHome,
  IconPencil,
  IconPlus,
  IconReceipt,
  IconTrash,
} from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { useMemo, useState, type ReactElement, type ReactNode } from 'react';

import {
  DeleteNetWorthItemDialog,
  netWorthDeleteTitle,
} from '@/components/delete-net-worth-item-dialog';
import {
  NetWorthItemDialog,
  netWorthFormTitle,
  type NetWorthEntity,
  type NetWorthItem,
  type NetWorthItemDraft,
} from '@/components/net-worth-item-dialog';
import { useTranslations } from '@/i18n/locale-context';
import { type MessageKey } from '@/i18n/messages';
import { dayOf } from '@/lib/calendar-day';
import { calendarLocale } from '@/lib/calendar-locale';
import { moneyOf } from '@/lib/money';
import {
  keepsTheKey,
  rereadsTheMonth,
  saveFailureKind,
  type SaveFailureKind,
} from '@/lib/save-failure';

type Editing =
  | { kind: 'form'; entity: NetWorthEntity; item: NetWorthItem | null }
  | { kind: 'delete'; entity: NetWorthEntity; item: NetWorthItem; key: string };

interface Picked {
  entity: NetWorthEntity;
  item: NetWorthItem;
}

const ACCOUNT_ICON: Record<AccountType, typeof IconCash> = {
  CASH: IconCash,
  DEBIT: IconCreditCard,
};

const ACCOUNT_LABEL: Record<AccountType, MessageKey> = {
  CASH: 'newAccount.typeCash',
  DEBIT: 'newAccount.typeDebit',
};

const ENTITY: Record<
  NetWorthEntity,
  { Icon: typeof IconCash; actions: MessageKey; add: MessageKey; empty: MessageKey }
> = {
  asset: {
    Icon: IconHome,
    actions: 'netWorth.actionsForAsset',
    add: 'netWorth.addAsset',
    empty: 'netWorth.emptyAssets',
  },
  liability: {
    Icon: IconReceipt,
    actions: 'netWorth.actionsForLiability',
    add: 'netWorth.addLiability',
    empty: 'netWorth.emptyLiabilities',
  },
};

const ROW = 'border-border/60 flex items-center gap-3 border-b px-4 py-3 last:border-b-0';

const BUBBLE =
  'bg-secondary text-muted-foreground grid size-9 shrink-0 place-items-center rounded-full';

function Block({
  testId,
  title,
  count,
  action,
  empty,
  children,
}: {
  testId: string;
  title: string;
  count: number;
  action?: ReactNode;
  empty: string;
  children: ReactNode;
}): ReactNode {
  return (
    <section data-testid={testId} className="flex min-w-0 flex-col gap-3">
      <div className="flex min-h-8 items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">
          {title}
          {count === 0 ? null : (
            <span className="text-muted-foreground font-normal"> ({count})</span>
          )}
        </h2>
        {action}
      </div>

      <Card className="overflow-hidden p-0">
        {count === 0 ? (
          <p className="text-muted-foreground px-4 py-6 text-sm">{empty}</p>
        ) : (
          <ul className="flex flex-col">{children}</ul>
        )}
      </Card>
    </section>
  );
}

export function NetWorth(): ReactNode {
  const { t, locale } = useTranslations();
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();

  const [editing, setEditing] = useState<Editing | null>(null);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [failure, setFailure] = useState<SaveFailureKind | null>(null);
  const [sent, setSent] = useState(false);
  const [rereading, setRereading] = useState(false);
  const [refusals, setRefusals] = useState(0);

  const budgets = useQuery(budgetsControllerListOptions());
  const worth = useQuery(netWorthControllerReadOptions());

  const budget = budgets.data?.find((candidate) => candidate.active) ?? null;
  const today = budget === null ? null : todayIn(budget.timezone);

  const money = useMemo(
    () => (budget === null ? null : moneyOf(locale, budget.currency, budget.minorDigits)),
    [budget, locale],
  );

  const reread = async (): Promise<void> => {
    const [key] = netWorthControllerReadQueryKey();

    await queryClient.invalidateQueries({ queryKey: [{ _id: key._id }] });
  };

  const settled = async (): Promise<void> => {
    setEditing(null);
    setFailure(null);
    setSent(false);
    await reread();
  };

  const refused = (error: unknown): void => {
    const kind = saveFailureKind(error);

    setFailure(kind);
    setRefusals((count) => count + 1);

    if (rereadsTheMonth(kind)) {
      setSent(false);
      void reread();
    }
  };

  const outcome = { onSuccess: settled, onError: refused };

  const createAsset = useMutation({ ...assetsControllerCreateMutation(), ...outcome });
  const changeAsset = useMutation({ ...assetsControllerChangeMutation(), ...outcome });
  const removeAsset = useMutation({ ...assetsControllerRemoveMutation(), ...outcome });
  const createLiability = useMutation({ ...liabilitiesControllerCreateMutation(), ...outcome });
  const changeLiability = useMutation({ ...liabilitiesControllerChangeMutation(), ...outcome });
  const removeLiability = useMutation({ ...liabilitiesControllerRemoveMutation(), ...outcome });

  const unread =
    (worth.isError && worth.data === undefined) || (budgets.isError && budgets.data === undefined);

  if (unread) {
    return (
      <p role="alert" className="text-destructive text-sm">
        {t('netWorth.unavailable')}
      </p>
    );
  }

  if (money === null || today === null || worth.data === undefined) {
    return null;
  }

  const saving =
    createAsset.isPending ||
    changeAsset.isPending ||
    createLiability.isPending ||
    changeLiability.isPending;

  const removing = removeAsset.isPending || removeLiability.isPending;

  const open = (next: Editing): void => {
    setFailure(null);
    setEditing(next);
  };

  const close = (): void => {
    setEditing(null);
    setFailure(null);

    if (sent) {
      setSent(false);
      setRereading(true);
      void reread().finally(() => setRereading(false));
    }
  };

  const save = (draft: NetWorthItemDraft): void => {
    if (editing?.kind !== 'form') return;

    setSent(true);

    const body = {
      name: draft.name,
      amount: draft.amount,
      date: draft.date,
      idempotencyKey: draft.idempotencyKey,
    };
    const asset = editing.entity === 'asset';

    if (editing.item === null) {
      (asset ? createAsset : createLiability).mutate({ body });

      return;
    }

    (asset ? changeAsset : changeLiability).mutate({ path: { id: editing.item.id }, body });
  };

  const remove = (): void => {
    if (editing?.kind !== 'delete') return;

    setSent(true);

    (editing.entity === 'asset' ? removeAsset : removeLiability).mutate({
      path: { id: editing.item.id },
      body: { idempotencyKey: editing.key },
    });
  };

  const edit = (entity: NetWorthEntity, item: NetWorthItem): void =>
    open({ kind: 'form', entity, item });

  const confirm = (entity: NetWorthEntity, item: NetWorthItem): void =>
    open({ kind: 'delete', entity, item, key: crypto.randomUUID() });

  const spelled = (date: string): string =>
    format(dayOf(date), 'd MMMM yyyy', { locale: calendarLocale(locale) });

  const actions = (entity: NetWorthEntity, item: NetWorthItem): ReactNode => {
    const trigger = (onClick?: () => void): ReactElement => (
      <Button
        type="button"
        variant="ghost"
        size="icon"
        disabled={rereading || saving || removing}
        aria-label={t(ENTITY[entity].actions, { name: item.name })}
        onClick={onClick}
      >
        <IconDots className="size-4" />
      </Button>
    );

    if (isMobile) {
      return trigger(() => setPicked({ entity, item }));
    }

    return (
      <DropdownMenu>
        <DropdownMenuTrigger render={trigger()} />
        <DropdownMenuContent align="end" className="min-w-52">
          <DropdownMenuItem onClick={() => edit(entity, item)}>
            <IconPencil className="size-4 shrink-0" />
            <span className="whitespace-nowrap">{t('netWorth.edit')}</span>
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onClick={() => confirm(entity, item)}>
            <IconTrash className="size-4 shrink-0" />
            <span className="whitespace-nowrap">{t('netWorth.delete')}</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  const items = (entity: NetWorthEntity, list: NetWorthItem[]): ReactNode => {
    const { Icon } = ENTITY[entity];

    return list.map((item) => (
      <li key={item.id} data-testid={`net-worth-row-${item.id}`} className={ROW}>
        <span className={BUBBLE}>
          <Icon aria-hidden className="size-4.5" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-medium">{item.name}</span>
          {item.date === null ? null : (
            <span
              data-testid={`net-worth-date-${item.id}`}
              className="text-muted-foreground text-xs"
            >
              {spelled(item.date)}
            </span>
          )}
        </span>
        <span
          data-testid={`net-worth-amount-${item.id}`}
          className="text-sm font-medium whitespace-nowrap tabular-nums"
        >
          {money.format(parseMoney(item.amount))}
        </span>
        {actions(entity, item)}
      </li>
    ));
  };

  const add = (entity: NetWorthEntity): ReactNode => (
    <Button
      type="button"
      variant="outline"
      disabled={rereading || saving || removing}
      onClick={() => open({ kind: 'form', entity, item: null })}
    >
      <IconPlus data-icon="inline-start" />
      {t(ENTITY[entity].add)}
    </Button>
  );

  const term = (label: MessageKey, testId: string, amount: string): ReactNode => (
    <span className="inline-flex items-baseline gap-2 whitespace-nowrap">
      <span className="text-muted-foreground text-sm">{t(label)}</span>
      <span data-testid={testId} className="text-sm font-semibold tabular-nums">
        {money.format(parseMoney(amount))}
      </span>
    </span>
  );

  const title =
    editing === null
      ? ''
      : editing.kind === 'form'
        ? t(netWorthFormTitle(editing.entity, editing.item !== null))
        : t(netWorthDeleteTitle(editing.entity), { name: editing.item.name });

  const surface =
    editing === null ? null : editing.kind === 'form' ? (
      <NetWorthItemDialog
        entity={editing.entity}
        item={editing.item}
        money={money}
        today={today}
        failure={failure}
        busy={saving}
        frozen={failure !== null && keepsTheKey(failure)}
        onSave={save}
        onEdited={() => setFailure(null)}
        onCancel={close}
      />
    ) : (
      <DeleteNetWorthItemDialog
        entity={editing.entity}
        name={editing.item.name}
        amount={money.format(parseMoney(editing.item.amount))}
        failed={failure !== null}
        refusals={refusals}
        busy={removing}
        onDelete={remove}
        onCancel={close}
      />
    );

  const { accounts, assets, liabilities } = worth.data;

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-2.5">
        <span className="text-muted-foreground text-sm">{t('netWorth.totalLabel')}</span>
        <span
          data-testid="net-worth-total"
          className="text-primary dark:text-chart-2 text-4xl leading-tight font-bold tracking-tight tabular-nums md:text-5xl"
        >
          {money.format(parseMoney(worth.data.total))}
        </span>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
          {term('netWorth.accounts', 'net-worth-accounts-total', worth.data.accountsTotal)}
          <span aria-hidden className="text-muted-foreground font-medium">
            +
          </span>
          {term('netWorth.assets', 'net-worth-assets-total', worth.data.assetsTotal)}
          <span aria-hidden className="text-muted-foreground font-medium">
            −
          </span>
          {term('netWorth.liabilities', 'net-worth-liabilities-total', worth.data.liabilitiesTotal)}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-3 lg:items-start">
        <Block
          testId="net-worth-block-accounts"
          title={t('netWorth.accounts')}
          count={accounts.length}
          empty={t('accounts.empty')}
        >
          {accounts.map((account) => {
            const Icon = ACCOUNT_ICON[account.type];

            return (
              <li key={account.id} data-testid={`net-worth-row-${account.id}`} className={ROW}>
                <span className={BUBBLE}>
                  <Icon aria-hidden className="size-4.5" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium">{account.name}</span>
                  <span className="text-muted-foreground text-xs">
                    {t(ACCOUNT_LABEL[account.type])}
                  </span>
                </span>
                <span
                  data-testid={`net-worth-amount-${account.id}`}
                  className="text-sm font-medium whitespace-nowrap tabular-nums"
                >
                  {money.format(parseMoney(account.balance))}
                </span>
                <span aria-hidden className="size-8 shrink-0" />
              </li>
            );
          })}
        </Block>

        <Block
          testId="net-worth-block-assets"
          title={t('netWorth.assets')}
          count={assets.length}
          action={add('asset')}
          empty={t('netWorth.emptyAssets')}
        >
          {items('asset', assets)}
        </Block>

        <Block
          testId="net-worth-block-liabilities"
          title={t('netWorth.liabilities')}
          count={liabilities.length}
          action={add('liability')}
          empty={t('netWorth.emptyLiabilities')}
        >
          {items('liability', liabilities)}
        </Block>
      </div>

      <Drawer
        showSwipeHandle
        open={picked !== null}
        onOpenChange={(next: boolean) => (next ? null : setPicked(null))}
      >
        <DrawerContent>
          {picked === null ? null : (
            <>
              <DrawerHeader className="pb-0">
                <DrawerTitle className="sr-only">
                  {t(ENTITY[picked.entity].actions, { name: picked.item.name })}
                </DrawerTitle>
              </DrawerHeader>

              <div className="px-4 pt-2 pb-6">
                <div className="flex flex-col">
                  <Item
                    size="sm"
                    className="hover:bg-muted"
                    render={
                      <button
                        type="button"
                        onClick={() => {
                          setPicked(null);
                          edit(picked.entity, picked.item);
                        }}
                      />
                    }
                  >
                    <ItemMedia variant="icon">
                      <IconPencil />
                    </ItemMedia>
                    <ItemContent>
                      <ItemTitle>{t('netWorth.edit')}</ItemTitle>
                    </ItemContent>
                  </Item>

                  <Item
                    size="sm"
                    className="text-destructive hover:bg-muted"
                    render={
                      <button
                        type="button"
                        onClick={() => {
                          setPicked(null);
                          confirm(picked.entity, picked.item);
                        }}
                      />
                    }
                  >
                    <ItemMedia variant="icon">
                      <IconTrash />
                    </ItemMedia>
                    <ItemContent>
                      <ItemTitle>{t('netWorth.delete')}</ItemTitle>
                    </ItemContent>
                  </Item>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  className="mt-3 w-full"
                  onClick={() => setPicked(null)}
                >
                  {t('netWorth.cancel')}
                </Button>
              </div>
            </>
          )}
        </DrawerContent>
      </Drawer>

      {isMobile ? (
        <Drawer
          showSwipeHandle
          open={editing !== null}
          onOpenChange={(next: boolean) => (next ? null : close())}
        >
          <DrawerContent className="max-h-[92dvh]">
            <DrawerHeader className="pb-0">
              <DrawerTitle className="sr-only" render={<p />}>
                {title}
              </DrawerTitle>
            </DrawerHeader>
            <div className="overflow-y-auto px-4 pb-6">{surface}</div>
          </DrawerContent>
        </Drawer>
      ) : (
        <Dialog open={editing !== null} onOpenChange={(next) => (next ? null : close())}>
          <DialogContent className="max-h-[85dvh] gap-0 overflow-x-hidden overflow-y-auto rounded-[24px] p-6 sm:max-w-[448px]">
            <DialogTitle className="sr-only" render={<p />}>
              {title}
            </DialogTitle>
            <DialogDescription className="sr-only">{title}</DialogDescription>
            {surface}
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
