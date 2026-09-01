'use client';

import { parseMoney, type AccountBalanceDto, type AccountType } from '@rondo/types';
import { Button } from '@rondo/ui/components/ui/button';
import { Card } from '@rondo/ui/components/ui/card';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@rondo/ui/components/ui/drawer';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@rondo/ui/components/ui/dropdown-menu';
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from '@rondo/ui/components/ui/item';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@rondo/ui/components/ui/select';
import { useIsMobile } from '@rondo/ui/hooks/use-mobile';
import { cn } from '@rondo/ui/lib/utils';
import {
  IconArchive,
  IconCash,
  IconCreditCard,
  IconDots,
  IconPencil,
  IconPlus,
  IconWallet,
} from '@tabler/icons-react';
import { useRef, useState, type ReactNode } from 'react';

import { useTranslations } from '@/i18n/locale-context';
import { type MessageKey } from '@/i18n/messages';
import { type MoneyReader } from '@/lib/money';

const ALL = 'all';

const ITEM_SHAPE = 'h-11 rounded-full pl-4 text-sm';

const POPUP_SHAPE = 'rounded-[1.75rem] p-1';

const LOOK: Record<AccountType, { Icon: typeof IconCash; label: MessageKey }> = {
  CASH: { Icon: IconCash, label: 'newAccount.typeCash' },
  DEBIT: { Icon: IconCreditCard, label: 'newAccount.typeDebit' },
};

export function AccountPanel({
  accounts,
  total,
  money,
  selected,
  variant = 'panel',
  onSelect,
  onAdd,
  onRename,
  onArchive,
}: {
  accounts: AccountBalanceDto[];
  total: string;
  money: MoneyReader;
  selected: string | null;
  variant?: 'panel' | 'switcher';
  onSelect: (id: string | null) => void;
  onAdd: () => void;
  onRename: (account: AccountBalanceDto) => void;
  onArchive: (account: AccountBalanceDto) => void;
}): ReactNode {
  const { t } = useTranslations();

  const isMobile = useIsMobile();
  const [opened, setOpened] = useState<string | null>(null);

  const emptied = (account: AccountBalanceDto): boolean => parseMoney(account.balance) === 0n;

  const trigger = (
    account: AccountBalanceDto,
    size: 'icon' | 'icon-xl',
    className: string,
    onClick?: () => void,
  ) => (
    <Button
      type="button"
      variant={size === 'icon-xl' ? 'outline' : 'ghost'}
      size={size}
      shape={size === 'icon-xl' ? 'pill' : 'default'}
      className={className}
      aria-label={t('accounts.actionsFor', { name: account.name })}
      onClick={onClick}
    >
      <IconDots className="size-4" />
    </Button>
  );

  const actions = (
    account: AccountBalanceDto,
    size: 'icon' | 'icon-xl',
    className: string,
  ): ReactNode => {
    if (isMobile) {
      return trigger(account, size, className, () => setOpened(account.id));
    }

    return (
      <DropdownMenu>
        <DropdownMenuTrigger render={trigger(account, size, className)} />
        <DropdownMenuContent align="end" className="min-w-52">
          <DropdownMenuItem onClick={() => onRename(account)}>
            <IconPencil className="size-4 shrink-0" />
            <span className="whitespace-nowrap">{t('accounts.rename')}</span>
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!emptied(account)} onClick={() => onArchive(account)}>
            <IconArchive className="size-4 shrink-0" />
            <span className="flex min-w-0 flex-col items-start">
              <span className="whitespace-nowrap">{t('accounts.archive')}</span>
              {emptied(account) ? null : (
                <span className="text-muted-foreground text-xs whitespace-nowrap">
                  {t('accounts.archiveNeedsZero')}
                </span>
              )}
            </span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  const picked = accounts.find((account) => account.id === opened) ?? null;
  const lastPicked = useRef<AccountBalanceDto | null>(null);
  if (picked !== null) {
    lastPicked.current = picked;
  }
  const chosenForActions = picked ?? lastPicked.current;

  const sheet = (
    <Drawer
      showSwipeHandle
      open={opened !== null}
      onOpenChange={(next: boolean) => (next ? null : setOpened(null))}
    >
      <DrawerContent>
        {chosenForActions === null ? null : (
          <>
            <DrawerHeader className="pb-0">
              <DrawerTitle className="sr-only">
                {t('accounts.actionsFor', { name: chosenForActions.name })}
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
                        setOpened(null);
                        onRename(chosenForActions);
                      }}
                    />
                  }
                >
                  <ItemMedia variant="icon">
                    <IconPencil />
                  </ItemMedia>
                  <ItemContent>
                    <ItemTitle>{t('accounts.rename')}</ItemTitle>
                  </ItemContent>
                </Item>

                <Item
                  size="sm"
                  className="hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
                  render={
                    <button
                      type="button"
                      disabled={!emptied(chosenForActions)}
                      onClick={() => {
                        setOpened(null);
                        onArchive(chosenForActions);
                      }}
                    />
                  }
                >
                  <ItemMedia variant="icon">
                    <IconArchive />
                  </ItemMedia>
                  <ItemContent>
                    <ItemTitle>{t('accounts.archive')}</ItemTitle>
                    {emptied(chosenForActions) ? null : (
                      <ItemDescription>{t('accounts.archiveNeedsZero')}</ItemDescription>
                    )}
                  </ItemContent>
                </Item>
              </div>

              <Button
                type="button"
                variant="outline"
                size="xl"
                shape="pill"
                className="mt-3 w-full"
                onClick={() => setOpened(null)}
              >
                {t('accounts.cancel')}
              </Button>
            </div>
          </>
        )}
      </DrawerContent>
    </Drawer>
  );

  const held = parseMoney(total);
  const chosen = accounts.find((account) => account.id === selected) ?? null;

  if (variant === 'switcher') {
    return (
      <div className="flex items-center gap-2">
        {sheet}
        <Select
          value={selected ?? ALL}
          onValueChange={(next: string | null) =>
            onSelect(next === null || next === ALL ? null : next)
          }
        >
          <SelectTrigger
            aria-label={t('transactions.panelTitle')}
            className={cn(ITEM_SHAPE, 'w-full data-[size=default]:h-11')}
          >
            <SelectValue>
              {(picked: string) => {
                const account = accounts.find((candidate) => candidate.id === picked) ?? null;
                const balance = account === null ? held : parseMoney(account.balance);

                return (
                  <>
                    <span className="truncate">
                      {account?.name ?? t('transactions.allAccounts')}
                    </span>
                    <span
                      className={cn('ml-auto tabular-nums', balance < 0n && 'text-destructive')}
                    >
                      {money.format(balance)}
                    </span>
                  </>
                );
              }}
            </SelectValue>
          </SelectTrigger>
          <SelectContent className={POPUP_SHAPE}>
            <SelectItem value={ALL} className={ITEM_SHAPE}>
              <IconWallet className="size-4" />
              <span className="flex-1">{t('transactions.allAccounts')}</span>
              <span className="tabular-nums">{money.format(held)}</span>
            </SelectItem>

            {accounts.map((account) => {
              const look = LOOK[account.type];
              const balance = parseMoney(account.balance);

              return (
                <SelectItem key={account.id} value={account.id} className={ITEM_SHAPE}>
                  <look.Icon className="size-4" />
                  <span className="flex-1">{account.name}</span>
                  <span className={cn('tabular-nums', balance < 0n && 'text-destructive')}>
                    {money.format(balance)}
                  </span>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>

        {chosen === null ? null : actions(chosen, 'icon-xl', 'shrink-0')}

        <Button
          type="button"
          variant="outline"
          size="icon-xl"
          shape="pill"
          className="shrink-0"
          aria-label={t('transactions.addAccount')}
          onClick={onAdd}
        >
          <IconPlus className="size-4" />
        </Button>
      </div>
    );
  }

  return (
    <aside data-testid="account-panel" className="flex w-full flex-col gap-3 lg:max-w-xs">
      {sheet}
      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">
          {t('transactions.panelTitle')}
          {accounts.length === 0 ? null : (
            <span className="text-muted-foreground font-normal"> ({accounts.length})</span>
          )}
        </h2>

        <Button
          type="button"
          variant="outline"
          className="h-10 w-full rounded-full"
          onClick={onAdd}
        >
          <IconPlus className="size-4" />
          {t('transactions.addAccount')}
        </Button>
      </div>

      <Card className="overflow-hidden p-0">
        {accounts.length === 0 ? (
          <p className="text-muted-foreground px-4 py-6 text-sm">{t('accounts.empty')}</p>
        ) : (
          <ul className="flex flex-col">
            <li
              className={cn(
                'border-border/60 relative flex items-center gap-3 border-b px-4 py-3',
                selected === null && 'bg-secondary/60',
              )}
            >
              <button
                type="button"
                aria-label={t('transactions.allAccounts')}
                onClick={() => onSelect(null)}
                className="absolute inset-0 z-0"
              />

              <span className="bg-secondary text-muted-foreground pointer-events-none relative z-10 grid size-9 shrink-0 place-items-center rounded-full">
                <IconWallet aria-hidden className="size-4.5" />
              </span>

              <span className="pointer-events-none relative z-10 flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium">
                  {t('transactions.allAccounts')}
                </span>
                <span className="text-muted-foreground text-xs">{t('transactions.heldNote')}</span>
              </span>

              <span
                data-testid="accounts-total"
                className={cn(
                  'pointer-events-none relative z-10 text-sm font-medium tabular-nums',
                  held < 0n && 'text-destructive',
                )}
              >
                {money.format(held)}
              </span>

              <span aria-hidden className="size-8 shrink-0" />
            </li>

            {accounts.map((account) => {
              const look = LOOK[account.type];
              const balance = parseMoney(account.balance);

              return (
                <li
                  key={account.id}
                  className={cn(
                    'border-border/60 relative flex items-center gap-3 border-b px-4 py-3 last:border-b-0',
                    selected === account.id && 'bg-secondary/60',
                  )}
                >
                  <button
                    type="button"
                    aria-label={account.name}
                    onClick={() => onSelect(account.id)}
                    className="absolute inset-0 z-0"
                  />

                  <span className="bg-secondary text-muted-foreground pointer-events-none relative z-10 grid size-9 shrink-0 place-items-center rounded-full">
                    <look.Icon aria-hidden className="size-4.5" />
                  </span>

                  <span className="pointer-events-none relative z-10 flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium">{account.name}</span>
                    <span className="text-muted-foreground text-xs">{t(look.label)}</span>
                  </span>

                  <span
                    data-testid={`balance-${account.id}`}
                    className={cn(
                      'pointer-events-none relative z-10 text-sm font-medium tabular-nums',
                      balance < 0n && 'text-destructive',
                    )}
                  >
                    {money.format(balance)}
                  </span>

                  {actions(account, 'icon', 'relative z-10 shrink-0')}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {accounts.length === 0 ? null : (
        <div className="flex items-baseline justify-between gap-3 px-4">
          <span className="text-muted-foreground text-sm">{t('accounts.total')}</span>
          <span
            className={cn('text-sm font-semibold tabular-nums', held < 0n && 'text-destructive')}
          >
            {money.format(held)}
          </span>
        </div>
      )}
    </aside>
  );
}
