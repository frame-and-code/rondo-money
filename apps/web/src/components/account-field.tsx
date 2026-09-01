'use client';

import { parseMoney } from '@rondo/types';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@rondo/ui/components/ui/select';
import { cn } from '@rondo/ui/lib/utils';
import { type ReactNode } from 'react';

import { FIELD_SHAPE, ITEM_SHAPE, POPUP_SHAPE } from '@/components/field-shape';
import { useTranslations } from '@/i18n/locale-context';
import type { MoneyReader } from '@/lib/money';

export interface PickableAccount {
  id: string;
  name: string;
  balance: string;
}

export function AccountField({
  label,
  value,
  accounts,
  money,
  onChange,
}: {
  label: string;
  value: string;
  accounts: PickableAccount[];
  money: MoneyReader;
  onChange: (next: string) => void;
}): ReactNode {
  const { t } = useTranslations();

  return (
    <Select value={value} onValueChange={(next: string | null) => onChange(next ?? '')}>
      <SelectTrigger
        aria-label={label}
        className={cn(FIELD_SHAPE, 'w-full border-transparent data-[size=default]:h-11')}
      >
        <SelectValue>
          {(picked: string) => {
            const account = accounts.find((candidate) => candidate.id === picked) ?? null;

            return account === null ? (
              ''
            ) : (
              <>
                <span className="flex-1 truncate text-left">{account.name}</span>
                <span className="flex items-baseline gap-1.5">
                  <span className="text-muted-foreground text-xs">
                    {t('transactions.availableNote')}
                  </span>
                  <span
                    className={cn(
                      'tabular-nums',
                      parseMoney(account.balance) < 0n && 'text-destructive',
                    )}
                  >
                    {money.format(parseMoney(account.balance))}
                  </span>
                </span>
              </>
            );
          }}
        </SelectValue>
      </SelectTrigger>
      <SelectContent className={POPUP_SHAPE}>
        {accounts.map((account) => (
          <SelectItem key={account.id} value={account.id} className={ITEM_SHAPE}>
            <span className="flex-1">{account.name}</span>
            <span
              className={cn('tabular-nums', parseMoney(account.balance) < 0n && 'text-destructive')}
            >
              {money.format(parseMoney(account.balance))}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
