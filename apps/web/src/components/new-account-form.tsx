'use client';

import {
  accountsControllerCreateMutation,
  accountsControllerListQueryKey,
  budgetsControllerListOptions,
} from '@rondo/api-client/react-query';
import { parseDecimalString, toDecimalString } from '@rondo/types';
import type { AccountType } from '@rondo/types';
import { ThemeToggle } from '@rondo/ui/components/theme-toggle';
import { Button } from '@rondo/ui/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@rondo/ui/components/ui/card';
import { Input } from '@rondo/ui/components/ui/input';
import { Label } from '@rondo/ui/components/ui/label';
import { Separator } from '@rondo/ui/components/ui/separator';
import { cn } from '@rondo/ui/lib/utils';
import {
  IconAlertCircle,
  IconCash,
  IconCheck,
  IconCreditCard,
  IconLoader,
} from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, type FormEvent } from 'react';

import { OnboardingSteps } from '@/components/onboarding-steps';
import { useTranslations } from '@/i18n/locale-context';
import { type MessageKey } from '@/i18n/messages';
import { accountNamePlaceholderKey } from '@/i18n/name-placeholders';

/// A tap target on a phone, the design system's own height from the medium breakpoint up.
const CONTROL = 'h-11 rounded-full px-3.5 text-sm md:h-8 md:rounded-2xl md:px-3';

/// The same tokens `Input` carries, because a field that holds a symbol beside its input still
/// has to read as a field beside the one that does not.
const FIELD = cn(
  'bg-input/50 flex w-full items-center gap-2 border border-transparent transition-colors',
  'focus-within:border-ring focus-within:ring-ring/30 focus-within:ring-3',
  CONTROL,
);

const TYPES: ReadonlyArray<{
  id: AccountType;
  icon: typeof IconCash;
  title: MessageKey;
  body: MessageKey;
}> = [
  {
    id: 'DEBIT',
    icon: IconCreditCard,
    title: 'newAccount.typeDebit',
    body: 'newAccount.typeDebitHint',
  },
  { id: 'CASH', icon: IconCash, title: 'newAccount.typeCash', body: 'newAccount.typeCashHint' },
];

/// Long enough to read the line under the check, short enough that nobody waits for it. This
/// is the last step, so nothing follows it to read the confirmation on.
const CONFIRMATION_MS = 2200;

/// The kind most first accounts are. Cash sits beside it rather than under it, so choosing the
/// other one is one tap and not a discovery.
const DEFAULT_TYPE: AccountType = 'DEBIT';

type AmountFault = 'negative' | 'shape' | 'digits';

interface Amount {
  minor: bigint | null;
  fault: AmountFault | null;
  typed: boolean;
}

interface Marks {
  group: string;
  decimal: string;
}

/// Both come from the locale rather than from a guess. A comma is the decimal mark in Russian
/// and the thousands separator in English, so rewriting it to a dot unconditionally reads
/// "1,250" as one and a quarter on a currency with three minor digits.
function marksOf(locale: string): Marks {
  const parts = new Intl.NumberFormat(locale).formatToParts(11111.1);

  return {
    group: parts.find((part) => part.type === 'group')?.value ?? '',
    decimal: parts.find((part) => part.type === 'decimal')?.value ?? '.',
  };
}

function quoted(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/// Digits, or digits grouped in threes by this locale's separator, with a plain space allowed
/// because that is what people type where the locale uses a narrow one. A separator anywhere
/// grouping could not have put it is a fault rather than something to drop: deleting the comma
/// in "1250,50" would send a hundred times the amount, and nothing downstream could tell.
/// A character class, never an alternation. Where the locale groups with a narrow space both
/// branches of `(?:\u00a0|\s)` match the same character, and a long input that fails the
/// pattern then backtracks exponentially, which on a paste is a frozen tab.
function wholeAmount(group: string): RegExp {
  const mark = group === '' || /\s/.test(group) ? '\\s' : `[${quoted(group)}\\s]`;

  return new RegExp(`^(?:\\d+|\\d{1,3}(?:${mark}\\d{3})+)$`);
}

/// A dot means the decimal mark wherever the locale groups with something else, so it is taken
/// there as well: people reach for it on a numeric keypad whatever their locale says. Where the
/// locale groups with dots it can only be grouping, and is left to the pattern below.
function decimalMarks(marks: Marks): readonly string[] {
  return marks.decimal === '.' || marks.group === '.' ? [marks.decimal] : [marks.decimal, '.'];
}

/// A trailing separator is someone still typing, not a malformed amount, so an empty fraction
/// is dropped rather than answered with an error the next keystroke removes.
function readAmount(raw: string, digits: number, marks: Marks): Amount {
  const trimmed = raw.trim();
  if (trimmed === '') {
    return { minor: 0n, fault: null, typed: false };
  }

  if (trimmed.startsWith('-')) {
    return { minor: null, fault: 'negative', typed: true };
  }

  const used = decimalMarks(marks).filter((mark) => trimmed.includes(mark));
  const parts = trimmed.split(used[0] ?? marks.decimal);
  const [whole = '', fraction = ''] = parts;
  // An amount under one unit is often typed straight from the mark, so a missing whole part is
  // a zero rather than a fault.
  if (parts.length > 2 || (whole !== '' && !wholeAmount(marks.group).test(whole))) {
    return { minor: null, fault: 'shape', typed: true };
  }

  if (fraction !== '' && !/^\d+$/.test(fraction)) {
    return { minor: null, fault: 'shape', typed: true };
  }

  if (fraction.length > digits) {
    return { minor: null, fault: 'digits', typed: true };
  }

  const plain = whole === '' ? '0' : whole.replace(/\s/g, '').split(marks.group).join('');
  const normalized = fraction === '' ? plain : `${plain}.${fraction}`;

  return { minor: parseDecimalString(normalized, digits), fault: null, typed: true };
}

function mintKey(): string {
  return crypto.randomUUID();
}

export function NewAccountForm({ nameIndex }: { nameIndex: number }) {
  const { t, locale } = useTranslations();
  const router = useRouter();
  const queryClient = useQueryClient();

  const {
    data: budgets,
    isError,
    isFetchedAfterMount,
    isSuccess,
  } = useQuery(budgetsControllerListOptions());
  const budget = budgets?.find((candidate) => candidate.active) ?? null;

  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>(DEFAULT_TYPE);
  const [amount, setAmount] = useState('');

  // Minted when the form opens, not per click, or a double click writes two accounts. It is
  // minted again only when the user changes their mind after a failure: the same key carrying
  // a different intent is refused by the API, which would read as a bug from the outside.
  const [idempotencyKey, setIdempotencyKey] = useState(mintKey);
  const [failed, setFailed] = useState(false);
  const [created, setCreated] = useState<string | null>(null);

  const create = useMutation({
    ...accountsControllerCreateMutation(),
    onSuccess: async (account) => {
      setCreated(account.name);
      await queryClient.invalidateQueries({ queryKey: accountsControllerListQueryKey() });
    },
    onError: () => {
      setFailed(true);
    },
  });

  // A visitor who reaches this step without a budget has nothing for an account to belong to.
  // Only this mount's own answer says that. A failed read knows nothing, and a cached one can
  // be older than the budget it is being asked about: both would send someone who already has
  // a budget to the screen that would create them a second one, deactivating the first.
  useEffect(() => {
    if (isSuccess && isFetchedAfterMount && budget === null) {
      router.replace('/new');
    }
  }, [isSuccess, isFetchedAfterMount, budget, router]);

  useEffect(() => {
    if (created === null) return;

    const timer = window.setTimeout(() => {
      router.replace('/categories');
    }, CONFIRMATION_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [created, router]);

  const money = useMemo(() => {
    if (budget === null) return null;

    // `narrowSymbol` falls back to the letter code by itself for a currency that has no
    // symbol, so the field never needs a fallback of its own.
    const format = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: budget.currency,
      currencyDisplay: 'narrowSymbol',
      // From the budget row, not from the browser's own currency table: the two disagree for a
      // code this runtime does not know, and the row is the one the amount was written at.
      minimumFractionDigits: budget.minorDigits,
      maximumFractionDigits: budget.minorDigits,
    });
    const parts = format.formatToParts(0);
    const symbolAt = parts.findIndex((part) => part.type === 'currency');
    const numberAt = parts.findIndex((part) => part.type === 'integer');

    return {
      format,
      symbol: parts[symbolAt]?.value ?? budget.currency,
      symbolFirst: symbolAt < numberAt,
      digits: budget.minorDigits,
      currency: budget.currency,
      marks: marksOf(locale),
    };
  }, [budget, locale]);

  if (money === null) {
    return isError ? (
      <p role="alert" className="text-destructive text-sm">
        {t('newAccount.budgetUnavailable')}
      </p>
    ) : null;
  }

  const read = readAmount(amount, money.digits, money.marks);

  /// The label only: what gets sent is the `bigint` this reads from, never the number below.
  /// `Intl.NumberFormat` is typed to take one, so the guard asks whether that number still says
  /// the same amount; where it does not, the digits stand alone rather than lie by a minor unit.
  const preview = (minor: bigint): string => {
    const decimal = toDecimalString(minor, money.digits);
    const asNumber = Number(decimal);

    return asNumber.toFixed(money.digits) === decimal ? money.format.format(asNumber) : decimal;
  };

  const faultMessage = (): string => {
    if (read.fault === 'negative') return t('newAccount.balanceNegative');
    if (read.fault === 'shape') return t('newAccount.balanceDigitsOnly');

    return money.digits === 0
      ? t('newAccount.balanceNoDecimals', { currency: money.currency })
      : t('newAccount.balanceDecimals', { currency: money.currency, digits: money.digits });
  };

  const edited = (): void => {
    if (!failed) return;

    setIdempotencyKey(mintKey());
    setFailed(false);
  };

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (read.minor === null) return;

    create.mutate({
      body: {
        name: name.trim(),
        type,
        initialBalance: read.minor.toString(10),
        idempotencyKey,
      },
    });
  };

  const symbol = <span className="text-muted-foreground shrink-0 text-sm">{money.symbol}</span>;

  return (
    <>
      <div className="absolute end-5 top-5 md:end-6 md:top-6">
        <ThemeToggle label={t('common.themeToggle.trigger')} />
      </div>

      <div className="grid gap-10 md:grid-cols-2 md:items-center md:gap-16">
        <div className="flex flex-col gap-8">
          <div className="hidden items-center gap-2 md:flex">
            <span className="bg-primary text-primary-foreground grid size-8 place-items-center rounded-lg text-sm font-semibold">
              R
            </span>
            <span className="font-semibold">Rondo Money</span>
          </div>

          <div className="flex flex-col gap-3">
            <h1 className="text-[26px] font-semibold tracking-tight md:text-[34px]">
              {t('newAccount.heading')}
            </h1>
            <p className="text-muted-foreground text-sm">{t('newAccount.lead')}</p>
          </div>

          <div className="max-md:hidden">
            <OnboardingSteps done={created === null ? 1 : 2} />
          </div>
        </div>

        <Card className="max-md:rounded-none max-md:bg-transparent max-md:py-0 max-md:shadow-none max-md:ring-0">
          {created === null ? (
            <CardHeader className="max-md:hidden">
              <CardTitle>{t('newAccount.cardTitle')}</CardTitle>
              <CardDescription>{t('newAccount.cardDescription')}</CardDescription>
            </CardHeader>
          ) : null}

          <CardContent className="max-md:px-0">
            {created === null ? (
              <form onSubmit={submit} className="flex flex-col gap-6">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="account-name">{t('newAccount.nameLabel')}</Label>
                  <Input
                    id="account-name"
                    value={name}
                    placeholder={t(accountNamePlaceholderKey(nameIndex))}
                    maxLength={60}
                    onChange={(event) => {
                      setName(event.target.value);
                      edited();
                    }}
                    disabled={create.isPending}
                    className={CONTROL}
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <span className="text-sm leading-none font-medium">
                    {t('newAccount.typeLabel')}
                  </span>
                  <div className="grid grid-cols-2 gap-3">
                    {TYPES.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        aria-pressed={type === option.id}
                        disabled={create.isPending}
                        onClick={() => {
                          setType(option.id);
                          edited();
                        }}
                        className={cn(
                          'flex flex-col items-start gap-2 rounded-2xl border p-3 text-start transition-colors disabled:opacity-50',
                          type === option.id
                            ? 'border-primary ring-primary/20 ring-3'
                            : 'border-border hover:bg-muted',
                        )}
                      >
                        <span
                          className={cn(
                            'grid size-8 place-items-center rounded-lg',
                            type === option.id ? 'bg-primary/10 text-primary' : 'bg-secondary',
                          )}
                        >
                          <option.icon className="size-4" />
                        </span>
                        <span className="flex flex-col gap-0.5">
                          <span className="text-sm font-medium">{t(option.title)}</span>
                          <span className="text-muted-foreground text-xs">{t(option.body)}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <Label htmlFor="account-balance">{t('newAccount.balanceLabel')}</Label>
                  <div
                    className={cn(
                      FIELD,
                      read.fault !== null && 'border-destructive ring-destructive/20 ring-3',
                    )}
                  >
                    {money.symbolFirst ? symbol : null}
                    <input
                      id="account-balance"
                      inputMode="decimal"
                      value={amount}
                      placeholder={toDecimalString(0n, money.digits).replace(
                        '.',
                        money.marks.decimal,
                      )}
                      onChange={(event) => {
                        setAmount(event.target.value);
                        edited();
                      }}
                      disabled={create.isPending}
                      className="placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent outline-none disabled:opacity-50"
                    />
                    {money.symbolFirst ? null : symbol}
                  </div>

                  {read.fault === null ? null : (
                    <p role="alert" className="text-destructive flex items-center gap-1.5 text-xs">
                      <IconAlertCircle className="size-3.5 shrink-0" />
                      {faultMessage()}
                    </p>
                  )}
                  {read.fault === null && !read.typed ? (
                    <p className="text-muted-foreground text-xs">{t('newAccount.balanceHint')}</p>
                  ) : null}
                  {read.fault === null && read.typed && read.minor !== null ? (
                    <p className="text-sm font-medium">
                      {t('newAccount.balancePreview', { amount: preview(read.minor) })}
                    </p>
                  ) : null}
                </div>

                {failed ? (
                  <p role="alert" className="text-destructive text-sm">
                    {t('newAccount.submitFailed')}
                  </p>
                ) : null}

                <Button
                  type="submit"
                  disabled={name.trim() === '' || read.minor === null || create.isPending}
                  className={CONTROL}
                >
                  {create.isPending ? <IconLoader className="size-4 animate-spin" /> : null}
                  {create.isPending ? t('newAccount.submitting') : t('newAccount.submit')}
                </Button>

                <p className="text-muted-foreground text-xs">{t('newAccount.footnote')}</p>
              </form>
            ) : (
              <div className="flex flex-col gap-5">
                <div className="flex items-center gap-3.5">
                  <span className="bg-primary text-primary-foreground grid size-14 shrink-0 place-items-center rounded-full motion-safe:animate-in motion-safe:zoom-in-50 motion-safe:duration-300">
                    <IconCheck
                      strokeWidth={2.5}
                      className="size-7 [stroke-dasharray:30] motion-safe:animate-draw-check"
                    />
                  </span>
                  <div className="flex flex-col gap-0.5">
                    <p className="text-xl font-semibold tracking-tight">
                      {t('newAccount.doneTitle', { name: created })}
                    </p>
                    <p className="text-muted-foreground text-sm">
                      {t(type === 'CASH' ? 'newAccount.typeCash' : 'newAccount.typeDebit')}
                    </p>
                  </div>
                </div>

                <div className="bg-secondary flex items-baseline justify-between gap-3 rounded-2xl px-4 py-3.5">
                  <span className="text-sm">{t('newAccount.doneReady')}</span>
                  <span className="text-[22px] font-semibold tracking-tight tabular-nums">
                    {preview(read.minor ?? 0n)}
                  </span>
                </div>

                <p className="text-muted-foreground flex items-center justify-between gap-2 text-sm">
                  {t('newAccount.doneOpening')}
                  <span className="flex gap-1" aria-hidden>
                    <span className="bg-current size-1 rounded-full motion-safe:animate-pulse" />
                    <span className="bg-current size-1 rounded-full motion-safe:animate-pulse [animation-delay:180ms]" />
                    <span className="bg-current size-1 rounded-full motion-safe:animate-pulse [animation-delay:360ms]" />
                  </span>
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-6 md:hidden">
          <Separator />
          <OnboardingSteps done={created === null ? 1 : 2} />
        </div>
      </div>
    </>
  );
}
