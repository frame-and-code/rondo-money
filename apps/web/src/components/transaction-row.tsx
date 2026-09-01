'use client';

import {
  calendarDateIn,
  parseMoney,
  type CategoryColor,
  type CategoryIcon,
  type Money,
  type TransactionDto,
} from '@rondo/types';
import { Button } from '@rondo/ui/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@rondo/ui/components/ui/dropdown-menu';
import { cn } from '@rondo/ui/lib/utils';
import {
  IconArrowsExchange,
  IconBuildingBank,
  IconDots,
  IconTrash,
  IconTrendingDown,
  IconTrendingUp,
} from '@tabler/icons-react';
import { type ReactNode } from 'react';

import { useTranslations } from '@/i18n/locale-context';
import { categoryLook } from '@/lib/category-look';
import { type MoneyReader } from '@/lib/money';

function iconOf(record: TransactionDto, amount: Money): typeof IconTrendingUp {
  if (record.transferId !== null) return IconArrowsExchange;
  if (record.isSystem) return IconBuildingBank;

  return amount < 0n ? IconTrendingDown : IconTrendingUp;
}

export interface CategoryLookOf {
  name: string;
  icon: CategoryIcon | null;
  color: CategoryColor | null;
}

export function TransactionRow({
  record,
  money,
  timeZone,
  accountName,
  categoryOf,
  showAccount,
  showAdded,
  onOpen,
  onDelete,
}: {
  record: TransactionDto;
  money: MoneyReader;
  timeZone: string;
  accountName: (id: string) => string | null;
  categoryOf: (id: string) => CategoryLookOf | null;
  showAccount: boolean;
  showAdded: boolean;
  onOpen: (record: TransactionDto) => void;
  onDelete: (record: TransactionDto) => void;
}): ReactNode {
  const { t, locale } = useTranslations();

  const amount = parseMoney(record.amount);
  const removable = !record.isSystem;

  const category = record.categoryId === null ? null : categoryOf(record.categoryId);
  const look = category === null ? null : categoryLook(category.icon, category.color);
  const Icon = look?.Icon ?? iconOf(record, amount);

  const counterpart =
    record.counterAccountId === null ? null : accountName(record.counterAccountId);

  const title = (): string => {
    if (record.isSystem) return t('transactions.openingBalance');

    if (record.transferId !== null) {
      const name = counterpart ?? '';

      return amount < 0n
        ? t('transactions.transferTo', { name })
        : t('transactions.transferFrom', { name });
    }

    return record.payee ?? t('transactions.noPayee');
  };

  const badge = record.isSystem
    ? t('transactions.systemBadge')
    : record.transferId !== null
      ? t('transactions.transferBadge')
      : null;

  const parts = [category?.name ?? null, showAccount ? accountName(record.accountId) : null].filter(
    (part): part is string => part !== null && part !== '',
  );

  const added = new Intl.DateTimeFormat(locale, {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    ...(calendarDateIn(new Date(record.createdAt), timeZone) === record.date
      ? {}
      : { day: 'numeric', month: 'short' }),
  }).format(new Date(record.createdAt));

  return (
    <li
      data-testid={`transaction-${record.id}`}
      className={cn(
        'border-border/60 relative flex items-center gap-3 border-b px-4 py-3 transition-colors last:border-b-0',
        'has-[[data-slot=row-open]:active]:bg-muted',
      )}
    >
      <button
        type="button"
        data-slot="row-open"
        aria-label={title()}
        onClick={() => onOpen(record)}
        className="absolute inset-0 z-0"
      />

      <span
        className="pointer-events-none relative z-10 grid size-9 shrink-0 place-items-center rounded-full bg-secondary text-muted-foreground"
        style={
          look === null
            ? undefined
            : {
                backgroundColor: `color-mix(in oklch, ${look.color} 12%, transparent)`,
                color: look.color,
              }
        }
      >
        <Icon aria-hidden className="size-4.5" />
      </span>

      <span className="pointer-events-none relative z-10 flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm font-medium">{title()}</span>
        {badge === null && parts.length === 0 ? null : (
          <span className="flex min-w-0 items-center gap-2">
            {badge === null ? null : (
              <span className="bg-secondary text-muted-foreground shrink-0 rounded-full px-2 py-0.5 text-[11px]">
                {badge}
              </span>
            )}
            {parts.length === 0 ? null : (
              <span className="text-muted-foreground truncate text-xs">{parts.join(' · ')}</span>
            )}
          </span>
        )}
      </span>

      {showAdded ? (
        <span
          data-testid={`added-${record.id}`}
          className="text-muted-foreground pointer-events-none relative z-10 hidden shrink-0 text-xs tabular-nums sm:block"
        >
          {added}
        </span>
      ) : null}

      <span
        data-testid={`amount-${record.id}`}
        className={cn(
          'pointer-events-none relative z-10 shrink-0 text-sm font-medium tabular-nums',
          amount > 0n && 'text-success',
        )}
      >
        {money.format(amount)}
      </span>

      {removable ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="relative z-10 hidden size-8 shrink-0 sm:flex"
                aria-label={t('transactions.deleteOne', { payee: title() })}
              >
                <IconDots className="size-4" />
              </Button>
            }
          />
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onDelete(record)}>
              <IconTrash className="size-4" />
              {t('transactions.delete')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <span aria-hidden className="hidden size-8 shrink-0 sm:block" />
      )}
    </li>
  );
}
