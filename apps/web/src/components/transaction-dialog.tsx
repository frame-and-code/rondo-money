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
import { cn } from '@rondo/ui/lib/utils';
import {
  IconAlertCircle,
  IconArrowDownLeft,
  IconArrowsExchange,
  IconArrowUpRight,
  IconCalendar,
  IconSelector,
  IconTrash,
} from '@tabler/icons-react';
import { format } from 'date-fns';
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';

import { AccountField } from '@/components/account-field';
import { FIELD_SHAPE } from '@/components/field-shape';
import { MONEY_FIELD, MoneyField } from '@/components/money-field';
import { PayeeField } from '@/components/payee-field';
import { useTranslations } from '@/i18n/locale-context';
import type { MessageKey } from '@/i18n/messages';
import { dateOf, dayOf } from '@/lib/calendar-day';
import { calendarLocale } from '@/lib/calendar-locale';
import { categoryLook } from '@/lib/category-look';
import type { MoneyReader } from '@/lib/money';

export type EntryType = TransactionEntryType;

type FormKind = EntryType | 'TRANSFER';

const KINDS: readonly FormKind[] = ['EXPENSE', 'INCOME', 'TRANSFER'];

const ENTRY_KINDS: readonly FormKind[] = ['EXPENSE', 'INCOME'];

const KIND_ICONS: Record<FormKind, typeof IconArrowUpRight> = {
  EXPENSE: IconArrowUpRight,
  INCOME: IconArrowDownLeft,
  TRANSFER: IconArrowsExchange,
};

const KIND_TONES: Record<FormKind, { chip: string; mark: string }> = {
  EXPENSE: { chip: 'border-primary text-primary bg-primary/10', mark: 'bg-primary/15' },
  INCOME: { chip: 'border-success text-success bg-success/10', mark: 'bg-success/15' },
  TRANSFER: { chip: 'border-warning text-warning bg-warning/10', mark: 'bg-warning/15' },
};

const KIND_LABELS: Record<FormKind, MessageKey> = {
  EXPENSE: 'transactions.kindExpense',
  INCOME: 'transactions.kindIncome',
  TRANSFER: 'transactions.kindTransfer',
};

export interface TransactionDraft {
  accountId: string;
  type: EntryType;
  amount: string;
  date: string;
  categoryId: string | null;
  payee: string | null;
  idempotencyKey: string;
}

export interface TransferDraft {
  fromAccountId: string;
  toAccountId: string;
  amount: string;
  date: string;
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
  onTransfer,
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
  onTransfer: (draft: TransferDraft, andMore: boolean) => void;
  onDelete: () => void;
}): ReactNode {
  const { t, locale } = useTranslations();
  const amountField = useId();
  const categoryField = useId();
  const payeeField = useId();

  const leg = record !== null && record.transferId !== null;
  const leaving = record !== null && record.amount.startsWith('-');

  const [key, setKey] = useState(() => crypto.randomUUID());
  const [kind, setKind] = useState<FormKind>(
    record === null ? 'EXPENSE' : leg ? 'TRANSFER' : leaving ? 'EXPENSE' : 'INCOME',
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
  const otherThan = (held: string): string =>
    accounts.find((account) => account.id !== held)?.id ?? '';

  const [accountId, setAccountId] = useState(
    (leg && !leaving ? record.counterAccountId : record?.accountId) ?? defaults.accountId,
  );
  const [toAccountId, setToAccountId] = useState(
    (leg
      ? leaving
        ? record.counterAccountId
        : record.accountId
      : otherThan(record?.accountId ?? defaults.accountId)) ?? '',
  );
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState('');
  const [flash, setFlash] = useState<string | null>(null);
  const [sent, setSent] = useState<{ payee: string; amount: string } | null>(null);
  const landed = useRef(written);

  const locked = record?.isSystem ?? false;
  const transferring = kind === 'TRANSFER';
  const type: EntryType = kind === 'TRANSFER' ? 'EXPENSE' : kind;
  const spending = kind === 'EXPENSE';
  const oneAccountTwice = transferring && toAccountId !== '' && toAccountId === accountId;

  const spelledDate = (() => {
    const spelled = format(dayOf(date), 'd MMMM yyyy', { locale: calendarLocale(locale) });

    return date === today ? `${t('transactions.today')}, ${spelled}` : spelled;
  })();

  const typed = money.read(amount);
  const minor = typed.partial || typed.fault !== null ? null : typed.minor;
  const named = transferring
    ? toAccountId !== '' && !oneAccountTwice
    : kind === 'INCOME' || categoryId !== null;
  const ready = minor !== null && minor > 0n && named;

  const pool: PickableCategory = { id: '', name: t('transactions.pool'), icon: null, color: null };

  const listed = groups.flatMap((group) => group.categories);
  const held =
    kept === null || listed.some((category) => category.id === kept.id)
      ? listed
      : [...listed, kept];
  const pickable = type === 'INCOME' ? [pool, ...held] : held;

  const chosen = held.find((category) => category.id === categoryId) ?? null;

  const matching = groups
    .map((group) => ({
      ...group,
      categories: group.categories.filter((category) =>
        category.name.toLowerCase().includes(query.trim().toLowerCase()),
      ),
    }))
    .filter((group) => group.categories.length > 0);

  const edited = (): void => {
    if (failed === null || failed === 'transactions.failNetwork') return;

    setKey(crypto.randomUUID());
  };

  const draftOf = (): TransactionDraft => ({
    accountId,
    type,
    amount: (minor ?? 0n).toString(10),
    date,
    categoryId: type === 'INCOME' ? categoryId : (categoryId ?? null),
    payee: payee.trim() === '' ? null : payee.trim(),
    idempotencyKey: key,
  });

  const transferOf = (): TransferDraft => ({
    fromAccountId: accountId,
    toAccountId,
    amount: (minor ?? 0n).toString(10),
    date,
    idempotencyKey: key,
  });

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (busy || !ready) return;

    if (transferring) {
      onTransfer(transferOf(), false);

      return;
    }

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
            : transferring
              ? record === null
                ? 'transactions.createTransfer'
                : 'transactions.editTransfer'
              : record === null
                ? spending
                  ? 'transactions.createExpense'
                  : 'transactions.createIncome'
                : spending
                  ? 'transactions.kindExpense'
                  : 'transactions.kindIncome',
        )}
      </h2>

      <div hidden={locked || leg} className="flex gap-2">
        {(record === null && accounts.length > 1 ? KINDS : ENTRY_KINDS).map((one) => {
          const Way = KIND_ICONS[one];
          const chosenKind = kind === one;

          return (
            <Button
              key={one}
              type="button"
              variant="outline"
              aria-pressed={chosenKind}
              className={cn(
                'h-11 flex-1 justify-start gap-2 rounded-full px-3',
                chosenKind && KIND_TONES[one].chip,
              )}
              onClick={() => {
                setKind(one);
                edited();
              }}
            >
              <span
                className={cn(
                  'grid size-6 shrink-0 place-items-center rounded-full',
                  chosenKind ? KIND_TONES[one].mark : 'bg-secondary',
                )}
              >
                <Way className="size-3.5" />
              </span>
              <span className="truncate">{t(KIND_LABELS[one])}</span>
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
          onChange={(next) => {
            setAmount(next);
            edited();
          }}
          disabled={busy}
          className={cn(MONEY_FIELD, FIELD_SHAPE)}
        />
        {!locked && !transferring && minor !== null && minor > 0n ? (
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
                  edited();
                  setPicking(false);
                }
              }}
            />
          </PopoverContent>
        </Popover>
      </div>

      <div hidden={locked || transferring} className="flex flex-col gap-1.5">
        <Label>{t('transactions.categoryLabel')}</Label>
        <Combobox
          items={query.trim() === '' ? pickable : matching.flatMap((group) => group.categories)}
          value={chosen ?? (type === 'INCOME' ? pool : null)}
          onValueChange={(next: PickableCategory | null) => {
            setCategoryId(next === null || next.id === '' ? null : next.id);
            edited();
          }}
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
            <CategoryMark category={chosen ?? pool} />
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

      <div hidden={locked || transferring} className="flex flex-col gap-1.5">
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
          onChange={(next) => {
            setPayee(next);
            edited();
          }}
        />
      </div>

      <div hidden={locked} className="flex flex-col gap-1.5">
        <Label>
          {t(transferring ? 'transactions.fromAccountLabel' : 'transactions.accountLabel')}
        </Label>
        <AccountField
          label={t(transferring ? 'transactions.fromAccountLabel' : 'transactions.accountLabel')}
          value={accountId}
          accounts={accounts}
          money={money}
          onChange={(next) => {
            setAccountId(next);
            if (next === toAccountId) {
              setToAccountId(otherThan(next));
            }
            edited();
          }}
        />
      </div>

      {transferring ? (
        <div className="flex flex-col gap-1.5">
          <Label>{t('transactions.toAccountLabel')}</Label>
          <AccountField
            label={t('transactions.toAccountLabel')}
            value={toAccountId}
            accounts={accounts}
            money={money}
            onChange={(next) => {
              setToAccountId(next);
              edited();
            }}
          />
          {oneAccountTwice ? (
            <p role="alert" className="text-destructive text-xs">
              {t('transactions.sameAccountHint')}
            </p>
          ) : null}
        </div>
      ) : null}

      {flash === null ? null : (
        <p data-testid="entry-flash" className="text-muted-foreground text-xs">
          {flash}
        </p>
      )}

      {failed === null ? null : (
        <Alert variant="destructive">
          <IconAlertCircle />
          <AlertTitle>
            {t(
              transferring
                ? 'transactions.failTitleTransfer'
                : spending
                  ? 'transactions.failTitleExpense'
                  : 'transactions.failTitleIncome',
            )}
          </AlertTitle>
          <AlertDescription>{t(worded(failed, spending))}</AlertDescription>
        </Alert>
      )}

      <div className="border-border/60 flex flex-col gap-2 border-t pt-4">
        <div className="flex gap-2">
          {record === null && !transferring ? (
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
