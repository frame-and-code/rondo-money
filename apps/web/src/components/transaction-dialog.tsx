'use client';

import {
  parseMoney,
  type CategoryColor,
  type CategoryIcon,
  type TransactionDto,
  type TransactionEntryType,
} from '@rondo/types';
import { Alert, AlertDescription, AlertTitle } from '@rondo/ui/components/ui/alert';
import { Button } from '@rondo/ui/components/ui/button';
import { Calendar } from '@rondo/ui/components/ui/calendar';
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
import { Label } from '@rondo/ui/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@rondo/ui/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@rondo/ui/components/ui/select';
import { cn } from '@rondo/ui/lib/utils';
import {
  IconAlertCircle,
  IconArrowDownLeft,
  IconArrowUpRight,
  IconCalendar,
  IconSelector,
  IconTrash,
} from '@tabler/icons-react';
import { format } from 'date-fns';
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';

import { MONEY_FIELD, MoneyField } from '@/components/money-field';
import { PayeeField } from '@/components/payee-field';
import { useTranslations } from '@/i18n/locale-context';
import type { MessageKey } from '@/i18n/messages';
import { dateOf, dayOf } from '@/lib/calendar-day';
import { calendarLocale } from '@/lib/calendar-locale';
import { categoryLook } from '@/lib/category-look';
import type { MoneyReader } from '@/lib/money';

const FIELD_SHAPE = 'h-11 rounded-full px-4 text-sm';

const ITEM_SHAPE = 'h-11 rounded-full pl-4 text-sm';

const POPUP_SHAPE = 'rounded-[1.75rem] p-1';

export type EntryType = TransactionEntryType;

export interface TransactionDraft {
  accountId: string;
  type: EntryType;
  amount: string;
  date: string;
  categoryId: string | null;
  payee: string | null;
  idempotencyKey: string;
}

export interface PickableCategory {
  id: string;
  name: string;
  icon: CategoryIcon | null;
  color: CategoryColor | null;
}

export interface PickableGroup {
  id: string;
  name: string;
  categories: PickableCategory[];
}

export interface DialogDefaults {
  accountId: string;
  date: string;
  categoryId: string | null;
  payee: string | null;
}

function worded(failed: MessageKey, spending: boolean): MessageKey {
  if (failed !== 'transactions.failBeforeAccount') return failed;

  return spending
    ? 'transactions.failBeforeAccountExpense'
    : 'transactions.failBeforeAccountIncome';
}

function CategoryMark({ category }: { category: PickableCategory }): ReactNode {
  const look = categoryLook(category.icon, category.color);

  return (
    <span
      className="grid size-6 shrink-0 place-items-center rounded-full"
      style={{
        backgroundColor: `color-mix(in oklch, ${look.color} 12%, transparent)`,
        color: look.color,
      }}
    >
      <look.Icon className="size-3.5" />
    </span>
  );
}

export function TransactionDialog({
  record,
  accounts,
  groups,
  kept,
  payees,
  money,
  today,
  defaults,
  failed,
  busy,
  written,
  onSave,
  onDelete,
}: {
  record: TransactionDto | null;
  accounts: { id: string; name: string; balance: string }[];
  groups: PickableGroup[];
  kept: PickableCategory | null;
  payees: string[];
  money: MoneyReader;
  today: string;
  defaults: DialogDefaults;
  failed: MessageKey | null;
  busy: boolean;
  written: number;
  onSave: (draft: TransactionDraft, andMore: boolean) => void;
  onDelete: () => void;
}): ReactNode {
  const { t, locale } = useTranslations();
  const amountField = useId();
  const categoryField = useId();
  const payeeField = useId();

  const [key, setKey] = useState(() => crypto.randomUUID());
  const [type, setType] = useState<EntryType>(
    record === null ? 'EXPENSE' : record.amount.startsWith('-') ? 'EXPENSE' : 'INCOME',
  );
  const [amount, setAmount] = useState(() => {
    if (record === null) return '';

    const stored = parseMoney(record.amount);

    return money.typed(stored < 0n ? -stored : stored);
  });
  const [date, setDate] = useState(record?.date ?? defaults.date);
  const [categoryId, setCategoryId] = useState<string | null>(
    record === null ? defaults.categoryId : record.categoryId,
  );
  const [payee, setPayee] = useState(
    record === null ? (defaults.payee ?? '') : (record.payee ?? ''),
  );
  const [accountId, setAccountId] = useState(record?.accountId ?? defaults.accountId);
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState('');
  const [flash, setFlash] = useState<string | null>(null);
  const [sent, setSent] = useState<{ payee: string; amount: string } | null>(null);
  const landed = useRef(written);

  const locked = record?.isSystem ?? false;
  const spending = type === 'EXPENSE';

  const spelledDate = (() => {
    const spelled = format(dayOf(date), 'd MMMM yyyy', { locale: calendarLocale(locale) });

    return date === today ? `${t('transactions.today')}, ${spelled}` : spelled;
  })();

  const typed = money.read(amount);
  const minor = typed.partial || typed.fault !== null ? null : typed.minor;
  const ready = minor !== null && minor > 0n && (type === 'INCOME' || categoryId !== null);

  const pool: PickableCategory = { id: '', name: t('transactions.pool'), icon: null, color: null };

  const listed = groups.flatMap((group) => group.categories);
  const held =
    kept === null || listed.some((category) => category.id === kept.id)
      ? listed
      : [...listed, kept];
  const pickable = type === 'INCOME' ? [pool, ...held] : held;

  const named = held.find((category) => category.id === categoryId) ?? null;

  const matching = groups
    .map((group) => ({
      ...group,
      categories: group.categories.filter((category) =>
        category.name.toLowerCase().includes(query.trim().toLowerCase()),
      ),
    }))
    .filter((group) => group.categories.length > 0);

  const draftOf = (): TransactionDraft => ({
    accountId,
    type,
    amount: (minor ?? 0n).toString(10),
    date,
    categoryId: type === 'INCOME' ? categoryId : (categoryId ?? null),
    payee: payee.trim() === '' ? null : payee.trim(),
    idempotencyKey: key,
  });

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (busy || !ready) return;

    onSave(draftOf(), false);
  };

  const again = (): void => {
    if (busy || !ready) return;

    const draft = draftOf();

    setSent({
      payee: draft.payee ?? t('transactions.noPayee'),
      amount: money.format(minor ?? 0n),
    });
    onSave(draft, true);
  };

  useEffect(() => {
    if (written === landed.current) {
      return;
    }

    landed.current = written;

    if (sent === null) {
      return;
    }

    setFlash(t('transactions.saved', sent));
    setSent(null);
    setKey(crypto.randomUUID());
    setAmount('');
  }, [written, sent, t]);

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">
        {t(
          locked
            ? 'transactions.openingTitle'
            : record === null
              ? spending
                ? 'transactions.createExpense'
                : 'transactions.createIncome'
              : spending
                ? 'transactions.kindExpense'
                : 'transactions.kindIncome',
        )}
      </h2>

      <div hidden={locked} className="flex gap-2">
        {(['EXPENSE', 'INCOME'] as const).map((kind) => {
          const Way = kind === 'EXPENSE' ? IconArrowUpRight : IconArrowDownLeft;

          return (
            <Button
              key={kind}
              type="button"
              variant="outline"
              aria-pressed={type === kind}
              className={cn(
                'h-11 flex-1 justify-start gap-2 rounded-full',
                type === kind &&
                  (kind === 'INCOME'
                    ? 'border-success text-success bg-success/10'
                    : 'border-primary text-primary bg-primary/10'),
              )}
              onClick={() => setType(kind)}
            >
              <span
                className={cn(
                  'grid size-6 place-items-center rounded-full',
                  type === kind
                    ? kind === 'INCOME'
                      ? 'bg-success/15'
                      : 'bg-primary/15'
                    : 'bg-secondary',
                )}
              >
                <Way className="size-3.5" />
              </span>
              {t(kind === 'EXPENSE' ? 'transactions.kindExpense' : 'transactions.kindIncome')}
            </Button>
          );
        })}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={amountField}>{t('transactions.amountLabel')}</Label>
        <MoneyField
          id={amountField}
          money={money}
          amount={amount}
          read={typed}
          onChange={setAmount}
          disabled={busy}
          className={cn(MONEY_FIELD, FIELD_SHAPE)}
        />
        {!locked && minor !== null && minor > 0n ? (
          <p className="text-muted-foreground text-xs">
            {t(type === 'EXPENSE' ? 'transactions.willLeave' : 'transactions.willArrive', {
              amount: money.format(minor),
            })}
          </p>
        ) : null}
        {minor === 0n && typed.typed ? (
          <p role="alert" className="text-destructive text-xs">
            {t('transactions.amountZero')}
          </p>
        ) : null}
      </div>

      <div hidden={locked} className="flex flex-col gap-1.5">
        <Label>{t('transactions.dateLabel')}</Label>
        <Popover open={picking} onOpenChange={setPicking}>
          <PopoverTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                className={cn(MONEY_FIELD, FIELD_SHAPE, 'justify-start gap-2 font-normal')}
              >
                <IconCalendar className="text-muted-foreground size-4" />
                <span className="flex-1 text-left">{spelledDate}</span>
                <IconSelector className="text-muted-foreground size-4" />
              </Button>
            }
          />
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={dayOf(date)}
              endMonth={dayOf(today)}
              disabled={{ after: dayOf(today) }}
              locale={calendarLocale(locale)}
              labels={{
                labelPrevious: () => t('common.calendarPrevious'),
                labelNext: () => t('common.calendarNext'),
                labelMonthDropdown: () => t('common.calendarMonth'),
                labelYearDropdown: () => t('common.calendarYear'),
              }}
              onSelect={(picked) => {
                if (picked) {
                  setDate(dateOf(picked));
                  setPicking(false);
                }
              }}
            />
          </PopoverContent>
        </Popover>
      </div>

      <div hidden={locked} className="flex flex-col gap-1.5">
        <Label>{t('transactions.categoryLabel')}</Label>
        <Combobox
          items={query.trim() === '' ? pickable : matching.flatMap((group) => group.categories)}
          value={named ?? (type === 'INCOME' ? pool : null)}
          onValueChange={(next: PickableCategory | null) =>
            setCategoryId(next === null || next.id === '' ? null : next.id)
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
            id={categoryField}
            aria-label={t('transactions.categoryLabel')}
            className={cn(MONEY_FIELD, FIELD_SHAPE, 'gap-2')}
          >
            <CategoryMark category={named ?? pool} />
            <span className="flex-1 text-left">
              <ComboboxValue placeholder={t('transactions.pool')} />
            </span>
          </ComboboxTrigger>
          <ComboboxContent align="start">
            <ComboboxInput
              autoFocus
              placeholder={t('transactions.findCategory')}
              showTrigger={false}
            />
            <ComboboxEmpty>{t('transactions.nothingFound')}</ComboboxEmpty>
            <ComboboxList>
              {type === 'INCOME' && query.trim() === '' ? (
                <ComboboxItem value={pool}>
                  <CategoryMark category={pool} />
                  {pool.name}
                </ComboboxItem>
              ) : null}
              {matching.map((group) => (
                <ComboboxGroup key={group.id}>
                  <ComboboxLabel>{group.name}</ComboboxLabel>
                  {group.categories.map((category) => (
                    <ComboboxItem key={category.id} value={category}>
                      <CategoryMark category={category} />
                      {category.name}
                    </ComboboxItem>
                  ))}
                </ComboboxGroup>
              ))}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
      </div>

      <div hidden={locked} className="flex flex-col gap-1.5">
        <Label>{t(spending ? 'transactions.payeeExpense' : 'transactions.payeeIncome')}</Label>
        <PayeeField
          id={payeeField}
          label={t(spending ? 'transactions.payeeExpense' : 'transactions.payeeIncome')}
          placeholder={t(
            spending ? 'transactions.payeeHintExpense' : 'transactions.payeeHintIncome',
          )}
          value={payee}
          payees={payees}
          disabled={busy}
          className={cn(MONEY_FIELD, FIELD_SHAPE)}
          onChange={setPayee}
        />
      </div>

      <div hidden={locked} className="flex flex-col gap-1.5">
        <Label>{t('transactions.accountLabel')}</Label>
        <Select value={accountId} onValueChange={(next: string | null) => setAccountId(next ?? '')}>
          <SelectTrigger
            aria-label={t('transactions.accountLabel')}
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
                  className={cn(
                    'tabular-nums',
                    parseMoney(account.balance) < 0n && 'text-destructive',
                  )}
                >
                  {money.format(parseMoney(account.balance))}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {flash === null ? null : (
        <p data-testid="entry-flash" className="text-muted-foreground text-xs">
          {flash}
        </p>
      )}

      {failed === null ? null : (
        <Alert variant="destructive">
          <IconAlertCircle />
          <AlertTitle>
            {t(spending ? 'transactions.failTitleExpense' : 'transactions.failTitleIncome')}
          </AlertTitle>
          <AlertDescription>{t(worded(failed, spending))}</AlertDescription>
        </Alert>
      )}

      <div className="border-border/60 flex flex-col gap-2 border-t pt-4">
        <div className="flex gap-2">
          {record === null ? (
            <Button
              type="button"
              variant="outline"
              className="h-11 flex-1 rounded-full"
              disabled={busy || !ready}
              onClick={again}
            >
              {t('transactions.saveAndMore')}
            </Button>
          ) : null}

          <Button type="submit" className="h-11 flex-1 rounded-full" disabled={busy || !ready}>
            {t('transactions.save')}
          </Button>
        </div>

        {record === null || locked ? null : (
          <Button
            type="button"
            variant="ghost"
            className="text-destructive h-11 rounded-full"
            onClick={onDelete}
          >
            <IconTrash className="size-4" />
            {t('transactions.delete')}
          </Button>
        )}
      </div>
    </form>
  );
}
