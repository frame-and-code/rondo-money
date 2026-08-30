'use client';

import {
  parseMoney,
  type BudgetViewTargetDto,
  type CategoryColor,
  type TargetKind,
} from '@rondo/types';
import { cn } from '@rondo/ui/lib/utils';

import { TargetMark } from '@/components/target-badge';
import { useTranslations } from '@/i18n/locale-context';
import type { MessageKey } from '@/i18n/messages';
import { monthLabel } from '@/lib/budget-month';
import { categoryLook } from '@/lib/category-look';
import type { MoneyReader } from '@/lib/money';

import type { ReactNode } from 'react';

const KIND_LABEL: Record<TargetKind, MessageKey> = {
  REFILL_TO: 'categories.goalRefillTo',
  CONTRIBUTE: 'categories.goalContribute',
  BY_DATE: 'categories.goalByDate',
  ACCUMULATE: 'categories.goalAccumulate',
};

function Line({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="flex items-center justify-between gap-3 leading-snug">
      <span className="text-muted-foreground min-w-0 truncate text-[13px]">{label}</span>
      <span className="flex items-center whitespace-nowrap text-[15px] font-medium tabular-nums">
        {children}
      </span>
    </span>
  );
}

export function TargetPanel({
  target,
  money,
  color,
  spoken = false,
}: {
  target: BudgetViewTargetDto;
  money: MoneyReader;
  color: CategoryColor | null;
  spoken?: boolean;
}): ReactNode {
  const { t, locale } = useTranslations();
  const paint = categoryLook(null, color).color;

  const amount = parseMoney(target.amount);
  const progress = parseMoney(target.progress);
  const remaining = parseMoney(target.remaining);
  const monthTarget = target.monthTarget === undefined ? null : parseMoney(target.monthTarget);
  const needed = target.needed === undefined ? null : parseMoney(target.needed);
  const share = amount <= 0n || progress <= 0n ? 0 : Math.min(1, Number(progress) / Number(amount));

  return (
    <span
      {...(spoken ? {} : { 'data-testid': 'target-panel' })}
      className={cn('flex w-full min-w-0 flex-col gap-3', spoken && 'sr-only')}
    >
      <span className="text-sm leading-tight font-medium">{t(KIND_LABEL[target.kind])}</span>

      <span aria-hidden className="bg-border/60 block h-px w-full" />

      <Line label={t('categories.goalTargetLine')}>{money.format(amount)}</Line>

      {target.dueMonth === undefined ? null : (
        <Line label={t('categories.goalDeadline')}>{monthLabel(target.dueMonth, locale)}</Line>
      )}

      {monthTarget === null || needed === null ? null : (
        <>
          <span aria-hidden className="bg-border/60 block h-px w-full" />
          <Line label={t('categories.goalAssignThisMonth')}>
            <TargetMark covered={needed === 0n} />
            <span className={cn('font-semibold', monthTarget - needed < 0n && 'text-destructive')}>
              {money.plain(monthTarget - needed)}
            </span>
            <span className="text-muted-foreground">{' / '}</span>
            <span className="text-muted-foreground font-normal">{money.format(monthTarget)}</span>
          </Line>
          {needed === 0n ? null : (
            <Line label={t('categories.goalStillToAssign')}>{money.format(needed)}</Line>
          )}
        </>
      )}

      <span aria-hidden className="bg-border/60 block h-px w-full" />

      <span className="flex flex-col gap-1">
        <span className="relative block h-4">
          <span
            data-testid="target-progress"
            className={cn(
              'absolute top-0 block text-[13px] leading-none font-semibold tabular-nums',
              progress < 0n && 'text-destructive',
            )}
            style={{
              left: `${(share * 100).toFixed(1)}%`,
              transform: `translateX(-${(share * 100).toFixed(1)}%)`,
            }}
          >
            {money.format(progress)}
          </span>
        </span>
        <span
          className="flex h-1.5 overflow-hidden rounded-full"
          style={{ background: `color-mix(in srgb, ${paint} var(--track-alpha), transparent)` }}
        >
          <i
            className="block rounded-full"
            style={{ width: `${(share * 100).toFixed(1)}%`, background: paint }}
          />
        </span>
        <span className="text-muted-foreground flex justify-between gap-2 text-xs tabular-nums">
          <span>{t('categories.goalLeft', { amount: money.format(remaining) })}</span>
          <span>{money.format(amount)}</span>
        </span>
      </span>
    </span>
  );
}
