'use client';

import {
  accountsControllerCreateMutation,
  accountsControllerListQueryKey,
  budgetsControllerListOptions,
} from '@rondo/api-client/react-query';
import { parseDecimalString, toDecimalString } from '@rondo/types';
import type { AccountType } from '@rondo/types';
import { ThemeToggle } from '@rondo/ui/components/theme-toggle';
import { Button, buttonVariants } from '@rondo/ui/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@rondo/ui/components/ui/card';
import { Input } from '@rondo/ui/components/ui/input';
import { Label } from '@rondo/ui/components/ui/label';
import { cn } from '@rondo/ui/lib/utils';
import {
  IconAlertCircle,
  IconCash,
  IconCheck,
  IconCreditCard,
  IconLoader,
} from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useMemo, useState, type FormEvent } from 'react';

import { OnboardingSteps } from '@/components/onboarding-steps';
import { useTranslations } from '@/i18n/locale-context';
import { type MessageKey } from '@/i18n/messages';
import { accountNamePlaceholderKey } from '@/i18n/name-placeholders';

const CONTROL = 'h-11 rounded-full px-3.5 text-sm md:h-8 md:rounded-2xl md:px-3';

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

function wholeAmount(group: string): RegExp {
  const mark = group === '' || /\s/.test(group) ? '\\s' : `[${quoted(group)}\\s]`;

  return new RegExp(`^(?:\\d+|\\d{1,3}(?:${mark}\\d{3})+)$`);
}

function decimalMarks(marks: Marks): readonly string[] {
  return marks.decimal === '.' || marks.group === '.' ? [marks.decimal] : [marks.decimal, '.'];
}

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
  const queryClient = useQueryClient();

  const { data: budgets, isError } = useQuery(budgetsControllerListOptions());
  const budget = budgets?.find((candidate) => candidate.active) ?? null;

  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>(DEFAULT_TYPE);
  const [amount, setAmount] = useState('');

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

  const money = useMemo(() => {
    if (budget === null) return null;

    const format = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: budget.currency,
      currencyDisplay: 'narrowSymbol',
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
      <div className="flex justify-end max-md:mb-6 md:absolute md:end-6 md:top-6">
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

          <OnboardingSteps done={created === null ? 1 : 2} />
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

                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground text-sm">
                      {t('newAccount.moreAccounts')}
                    </span>
                    <Link
                      href="/accounts"
                      className={cn(buttonVariants({ variant: 'outline' }), CONTROL)}
                    >
                      {t('nav.accounts')}
                    </Link>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm">{t('newAccount.startAssigning')}</span>
                    <Link href="/categories" className={cn(buttonVariants(), CONTROL)}>
                      {t('nav.categories')}
                    </Link>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
