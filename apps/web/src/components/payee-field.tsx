'use client';

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
  ComboboxValue,
} from '@rondo/ui/components/ui/combobox';
import { cn } from '@rondo/ui/lib/utils';
import { useState, type ReactNode } from 'react';

import { PICKER_ITEM } from '@/components/picker-item';
import { useTranslations } from '@/i18n/locale-context';

export const PAYEE_MAX = 100;

const HINTS = 6;

export function PayeeField({
  id,
  label,
  placeholder,
  value,
  payees,
  disabled = false,
  className,
  onChange,
}: {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  payees: string[];
  disabled?: boolean;
  className?: string;
  onChange: (next: string) => void;
}): ReactNode {
  const { t } = useTranslations();
  const [query, setQuery] = useState('');

  const asked = query.trim();
  const matching = payees.filter((payee) => payee.toLowerCase().includes(asked.toLowerCase()));
  const known = payees.some((payee) => payee.toLowerCase() === asked.toLowerCase());
  const hints = matching.slice(0, HINTS);
  const offered = asked === '' || known ? hints : [asked, ...hints];

  return (
    <Combobox
      items={offered}
      value={value === '' ? null : value}
      onValueChange={(next: string | null) => onChange(next ?? '')}
      autoHighlight
      filter={null}
      inputValue={query}
      onInputValueChange={setQuery}
      disabled={disabled}
    >
      <ComboboxTrigger id={id} aria-label={label} className={cn('justify-between', className)}>
        <ComboboxValue placeholder={placeholder} />
      </ComboboxTrigger>
      <ComboboxContent align="start">
        <ComboboxInput
          autoFocus
          maxLength={PAYEE_MAX}
          placeholder={placeholder}
          showTrigger={false}
        />
        <ComboboxEmpty>{t('transactions.nothingFound')}</ComboboxEmpty>
        <ComboboxList>
          {asked === '' || known ? null : (
            <ComboboxItem value={asked} className={PICKER_ITEM}>
              {t('transactions.payeeAdd', { name: asked })}
            </ComboboxItem>
          )}
          {hints.map((payee) => (
            <ComboboxItem key={payee} value={payee} className={PICKER_ITEM}>
              {payee}
            </ComboboxItem>
          ))}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
