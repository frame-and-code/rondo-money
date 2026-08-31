'use client';

import { parseMoney, type TransactionDto } from '@rondo/types';
import { format } from 'date-fns';
import { type ReactNode } from 'react';

import { TransactionRow, type CategoryLookOf } from '@/components/transaction-row';
import { useTranslations } from '@/i18n/locale-context';
import { dayOf } from '@/lib/calendar-day';
import { calendarLocale } from '@/lib/calendar-locale';
import { type MoneyReader } from '@/lib/money';
import { type FeedDay } from '@/lib/transaction-feed';

export function TransactionDay({
  day,
  money,
  timeZone,
  accountName,
  categoryOf,
  showAccount,
  onOpen,
  onDelete,
}: {
  day: FeedDay;
  money: MoneyReader;
  timeZone: string;
  accountName: (id: string) => string | null;
  categoryOf: (id: string) => CategoryLookOf | null;
  showAccount: boolean;
  onOpen: (record: TransactionDto) => void;
  onDelete: (record: TransactionDto) => void;
}): ReactNode {
  const { t, locale } = useTranslations();

  const total = parseMoney(day.total);

  const spelled = format(dayOf(day.date), 'd MMMM', { locale: calendarLocale(locale) });

  const heading =
    day.name === 'today'
      ? `${t('transactions.today')}, ${spelled}`
      : day.name === 'yesterday'
        ? `${t('transactions.yesterday')}, ${spelled}`
        : spelled;

  return (
    <section className="flex flex-col gap-1.5">
      <header className="flex items-baseline gap-3 px-4">
        <h3 className="flex-1 text-sm font-medium">{heading}</h3>
        <span
          data-testid={`day-total-${day.date}`}
          className="text-muted-foreground text-xs tabular-nums"
        >
          {money.format(total)}
        </span>
        <span aria-hidden className="hidden size-8 shrink-0 sm:block" />
      </header>

      <ul className="bg-card border-border/60 flex flex-col overflow-hidden rounded-[24px] border">
        {day.records.map((record) => (
          <TransactionRow
            key={record.id}
            record={record}
            money={money}
            timeZone={timeZone}
            accountName={accountName}
            categoryOf={categoryOf}
            showAccount={showAccount}
            showAdded
            onOpen={onOpen}
            onDelete={onDelete}
          />
        ))}
      </ul>
    </section>
  );
}
