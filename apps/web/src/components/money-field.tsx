'use client';

import { InputGroupInput } from '@rondo/ui/components/ui/input-group';
import { cn } from '@rondo/ui/lib/utils';
import { IconAlertCircle } from '@tabler/icons-react';

import { useTranslations } from '@/i18n/locale-context';
import { type Amount, type MoneyReader } from '@/lib/money';

export const MONEY_FIELD = cn(
  'bg-input/50 flex w-full items-center gap-2 border border-transparent transition-colors',
  'focus-within:border-ring focus-within:ring-ring/30 focus-within:ring-3',
);

export function MoneyField({
  id,
  money,
  amount,
  read,
  onChange,
  disabled = false,
  hint,
  preview,
  className,
}: {
  id: string;
  money: MoneyReader;
  amount: string;
  read: Amount;
  onChange: (next: string) => void;
  disabled?: boolean;
  hint?: string;
  preview?: (amount: bigint) => string;
  className?: string;
}) {
  const { t } = useTranslations();

  const faultMessage = (): string => {
    if (read.fault === 'negative') return t('newAccount.balanceNegative');
    if (read.fault === 'shape') return t('newAccount.balanceDigitsOnly');

    return money.digits === 0
      ? t('newAccount.balanceNoDecimals', { currency: money.currency })
      : t('newAccount.balanceDecimals', { currency: money.currency, digits: money.digits });
  };

  return (
    <>
      <div
        className={cn(
          className,
          read.fault !== null && 'border-destructive ring-destructive/20 ring-3',
        )}
      >
        <InputGroupInput
          id={id}
          inputMode="decimal"
          value={amount}
          placeholder={money.typed(0n)}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          className="h-auto min-w-0 flex-1 p-0 text-sm"
        />
        <span className="text-muted-foreground shrink-0 text-sm">{money.symbol}</span>
      </div>

      {read.fault === null ? null : (
        <p role="alert" className="text-destructive flex items-center gap-1.5 text-xs">
          <IconAlertCircle className="size-3.5 shrink-0" />
          {faultMessage()}
        </p>
      )}
      {read.fault === null && !read.typed && hint !== undefined ? (
        <p className="text-muted-foreground text-xs">{hint}</p>
      ) : null}
      {read.fault === null && read.typed && read.minor !== null && preview !== undefined ? (
        <p className="text-sm font-medium">{preview(read.minor)}</p>
      ) : null}
    </>
  );
}
