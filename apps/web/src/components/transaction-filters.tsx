'use client';

import { type TransactionType } from '@rondo/types';
import { Button } from '@rondo/ui/components/ui/button';
import { Calendar } from '@rondo/ui/components/ui/calendar';
import { Card, CardContent } from '@rondo/ui/components/ui/card';
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
  ComboboxTrigger,
  ComboboxValue,
} from '@rondo/ui/components/ui/combobox';
import { Popover, PopoverContent, PopoverTrigger } from '@rondo/ui/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@rondo/ui/components/ui/select';
import { cn } from '@rondo/ui/lib/utils';
import { IconCalendar, IconFilter, IconSelector } from '@tabler/icons-react';
import { format } from 'date-fns';
import { useState, type ReactNode } from 'react';

import { PICKER_ITEM } from '@/components/picker-item';
import { type PickableCategory, type PickableGroup } from '@/components/transaction-dialog';
import { useTranslations } from '@/i18n/locale-context';
import type { MessageKey } from '@/i18n/messages';
import { dateOf, dayOf } from '@/lib/calendar-day';
import { calendarLocale } from '@/lib/calendar-locale';
import { categoryLook } from '@/lib/category-look';

export interface Filters {
  payee: string | null;
  categoryId: string | null;
  type: TransactionType | null;
  from: string | null;
  to: string | null;
}

export const NO_FILTERS: Filters = {
  payee: null,
  categoryId: null,
  type: null,
  from: null,
  to: null,
};

const KINDS: { value: TransactionType; label: MessageKey }[] = [
  { value: 'EXPENSE', label: 'transactions.typeExpense' },
  { value: 'INCOME', label: 'transactions.typeIncome' },
  { value: 'TRANSFER', label: 'transactions.typeTransfer' },
];

const ALL = 'all';

const TRIGGER = cn(
  'bg-input/50 flex h-9 w-full items-center justify-between gap-1.5',
  'rounded-full border border-transparent px-3 text-sm transition-colors',
  'focus-visible:border-ring focus-visible:ring-ring/30 focus-visible:ring-3 outline-none',
);
const SELECT_TRIGGER = cn(TRIGGER, 'data-[size=default]:h-9');
const POPUP = 'min-w-64 rounded-2xl p-1';

export function activeFilters(filters: Filters): number {
  const named = [filters.payee, filters.categoryId, filters.type].filter(
    (value) => value !== null,
  ).length;

  return named + (filters.from === null && filters.to === null ? 0 : 1);
}

function Mark({ category }: { category: PickableCategory }): ReactNode {
  const look = categoryLook(category.icon, category.color);

  return (
    <span
      className="grid size-5 shrink-0 place-items-center rounded-full"
      style={{
        backgroundColor: `color-mix(in oklch, ${look.color} 12%, transparent)`,
        color: look.color,
      }}
    >
      <look.Icon className="size-3" />
    </span>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }): ReactNode {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="text-muted-foreground text-xs">{label}</span>
      {children}
    </div>
  );
}

function OneOf({
  label,
  value,
  options,
  onPick,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onPick: (next: string) => void;
}): ReactNode {
  return (
    <Select value={value} onValueChange={(next: string | null) => onPick(next ?? ALL)}>
      <SelectTrigger aria-label={label} className={SELECT_TRIGGER}>
        <SelectValue>
          {(picked: string) =>
            options.find((option) => option.value === picked)?.label ?? options[0]?.label ?? ''
          }
        </SelectValue>
      </SelectTrigger>
      <SelectContent className={POPUP}>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value} className={PICKER_ITEM}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function FilterToggle({
  count,
  open,
  onToggle,
  onReset,
}: {
  count: number;
  open: boolean;
  onToggle: () => void;
  onReset: () => void;
}): ReactNode {
  const { t } = useTranslations();

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant={open ? 'secondary' : 'outline'}
        className="h-9 gap-1.5 rounded-full px-3"
        onClick={onToggle}
        aria-expanded={open}
      >
        <IconFilter className="size-4" />
        {t('transactions.filter')}
        {count === 0 ? null : (
          <span
            data-testid="filter-count"
            className="bg-primary text-primary-foreground rounded-full px-1.5 text-xs"
          >
            {count}
          </span>
        )}
      </Button>
      {count === 0 ? null : (
        <Button
          type="button"
          variant="ghost"
          className="text-muted-foreground h-9 rounded-full px-3"
          onClick={onReset}
        >
          {t('transactions.reset')}
        </Button>
      )}
    </div>
  );
}

export function TransactionFilters({
  filters,
  groups,
  payees,
  today,
  onChange,
}: {
  filters: Filters;
  groups: PickableGroup[];
  payees: string[];
  today: string;
  onChange: (next: Filters) => void;
}): ReactNode {
  const { t, locale } = useTranslations();
  const [asked, setAsked] = useState('');
  const [query, setQuery] = useState('');
  const [picking, setPicking] = useState(false);

  const spelled = (date: string): string =>
    format(dayOf(date), 'd MMM yyyy', { locale: calendarLocale(locale) });

  const shortened = (date: string): string =>
    format(dayOf(date), 'd MMM', { locale: calendarLocale(locale) });

  const chosenRange =
    filters.from === null && filters.to === null
      ? undefined
      : {
          from: filters.from === null ? undefined : dayOf(filters.from),
          to: filters.to === null ? undefined : dayOf(filters.to),
        };

  const spelledPeriod = (() => {
    if (filters.from === null && filters.to === null) return t('transactions.allPeriod');
    if (filters.from !== null && filters.to === null) {
      return t('transactions.periodFrom', { date: spelled(filters.from) });
    }
    if (filters.from === null && filters.to !== null) {
      return t('transactions.periodTo', { date: spelled(filters.to) });
    }

    if (filters.from === filters.to) return spelled(filters.from ?? '');

    return `${shortened(filters.from ?? '')} \u2013 ${spelled(filters.to ?? '')}`;
  })();

  const anyone = t('transactions.allPayees');
  const matchingPayees = payees.filter((payee) =>
    payee.toLowerCase().includes(asked.trim().toLowerCase()),
  );

  const everything: PickableCategory = {
    id: ALL,
    name: t('transactions.allCategories'),
    icon: null,
    color: null,
  };
  const held = groups.flatMap((group) => group.categories);
  const chosen = held.find((category) => category.id === filters.categoryId) ?? everything;
  const matchingGroups = groups
    .map((group) => ({
      ...group,
      categories: group.categories.filter((category) =>
        category.name.toLowerCase().includes(query.trim().toLowerCase()),
      ),
    }))
    .filter((group) => group.categories.length > 0);

  return (
    <Card className="py-4">
      <CardContent className="grid grid-cols-2 gap-3 px-4 lg:grid-cols-4">
        <Field label={t('transactions.payeeLabel')}>
          <Combobox
            items={asked.trim() === '' ? [anyone, ...matchingPayees] : matchingPayees}
            value={filters.payee ?? anyone}
            onValueChange={(next: string | null) =>
              onChange({ ...filters, payee: next === null || next === anyone ? null : next })
            }
            filter={null}
            inputValue={asked}
            onInputValueChange={setAsked}
          >
            <ComboboxTrigger aria-label={t('transactions.payeeLabel')} className={TRIGGER}>
              <span className="flex-1 truncate text-left">
                <ComboboxValue />
              </span>
            </ComboboxTrigger>
            <ComboboxContent align="start" className={POPUP}>
              <ComboboxInput
                autoFocus
                placeholder={t('transactions.findPayee')}
                showTrigger={false}
              />
              <ComboboxEmpty>{t('transactions.nothingFound')}</ComboboxEmpty>
              <ComboboxList>
                {asked.trim() === '' ? (
                  <ComboboxItem value={anyone} className={PICKER_ITEM}>
                    {anyone}
                  </ComboboxItem>
                ) : null}
                {matchingPayees.map((payee) => (
                  <ComboboxItem key={payee} value={payee} className={PICKER_ITEM}>
                    {payee}
                  </ComboboxItem>
                ))}
              </ComboboxList>
            </ComboboxContent>
          </Combobox>
        </Field>

        <Field label={t('transactions.periodLabel')}>
          <Popover open={picking} onOpenChange={setPicking}>
            <PopoverTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  aria-label={t('transactions.periodLabel')}
                  className={cn(TRIGGER, 'justify-start gap-2 font-normal')}
                >
                  <IconCalendar className="text-muted-foreground size-4" />
                  <span className="flex-1 truncate text-left">{spelledPeriod}</span>
                  <IconSelector className="text-muted-foreground size-4" />
                </Button>
              }
            />
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="range"
                selected={chosenRange}
                endMonth={dayOf(today)}
                disabled={{ after: dayOf(today) }}
                locale={calendarLocale(locale)}
                labels={{
                  labelPrevious: () => t('common.calendarPrevious'),
                  labelNext: () => t('common.calendarNext'),
                  labelMonthDropdown: () => t('common.calendarMonth'),
                  labelYearDropdown: () => t('common.calendarYear'),
                }}
                onSelect={(_range, day: Date) => {
                  const picked = dateOf(day);
                  const opening = filters.from === null || filters.to !== null;

                  if (opening) {
                    onChange({ ...filters, from: picked, to: null });

                    return;
                  }

                  const held = filters.from ?? picked;

                  onChange({
                    ...filters,
                    from: picked < held ? picked : held,
                    to: picked < held ? held : picked,
                  });
                }}
              />
              {filters.from === null && filters.to === null ? null : (
                <div className="border-t p-2">
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-9 w-full rounded-full text-sm"
                    onClick={() => {
                      onChange({ ...filters, from: null, to: null });
                      setPicking(false);
                    }}
                  >
                    {t('transactions.allPeriod')}
                  </Button>
                </div>
              )}
            </PopoverContent>
          </Popover>
        </Field>

        <Field label={t('transactions.typeLabel')}>
          <OneOf
            label={t('transactions.typeLabel')}
            value={filters.type ?? ALL}
            options={[
              { value: ALL, label: t('transactions.allTypes') },
              ...KINDS.map((kind) => ({ value: kind.value, label: t(kind.label) })),
            ]}
            onPick={(next) =>
              onChange({ ...filters, type: next === ALL ? null : (next as TransactionType) })
            }
          />
        </Field>

        <Field label={t('transactions.categoryLabel')}>
          <Combobox
            items={
              query.trim() === ''
                ? [everything, ...held]
                : matchingGroups.flatMap((group) => group.categories)
            }
            value={chosen}
            onValueChange={(next: PickableCategory | null) =>
              onChange({
                ...filters,
                categoryId: next === null || next.id === ALL ? null : next.id,
              })
            }
            itemToStringLabel={(category: PickableCategory) => category.name}
            isItemEqualToValue={(left: PickableCategory, right: PickableCategory) =>
              left.id === right.id
            }
            filter={null}
            inputValue={query}
            onInputValueChange={setQuery}
          >
            <ComboboxTrigger
              aria-label={t('transactions.categoryLabel')}
              className={cn(TRIGGER, 'gap-2')}
            >
              <span className="flex-1 truncate text-left">
                <ComboboxValue />
              </span>
            </ComboboxTrigger>
            <ComboboxContent align="start" className={POPUP}>
              <ComboboxInput
                autoFocus
                placeholder={t('transactions.findCategory')}
                showTrigger={false}
              />
              <ComboboxEmpty>{t('transactions.nothingFound')}</ComboboxEmpty>
              <ComboboxList>
                {query.trim() === '' ? (
                  <ComboboxItem value={everything} className={PICKER_ITEM}>
                    {everything.name}
                  </ComboboxItem>
                ) : null}
                {matchingGroups.map((group) => (
                  <ComboboxGroup key={group.id}>
                    <ComboboxLabel>{group.name}</ComboboxLabel>
                    {group.categories.map((category) => (
                      <ComboboxItem key={category.id} value={category} className={PICKER_ITEM}>
                        <Mark category={category} />
                        {category.name}
                      </ComboboxItem>
                    ))}
                  </ComboboxGroup>
                ))}
              </ComboboxList>
            </ComboboxContent>
          </Combobox>
        </Field>
      </CardContent>
    </Card>
  );
}
