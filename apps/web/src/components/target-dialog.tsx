'use client';

import {
  isTargetKind,
  monthOf,
  parseCalendarDate,
  parseMoney,
  type BudgetViewTargetDto,
  type CalendarMonth,
  type TargetKind,
} from '@rondo/types';
import { Button } from '@rondo/ui/components/ui/button';
import { Calendar } from '@rondo/ui/components/ui/calendar';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from '@rondo/ui/components/ui/input-group';
import { Label } from '@rondo/ui/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@rondo/ui/components/ui/popover';
import { RadioGroup, RadioGroupItem } from '@rondo/ui/components/ui/radio-group';
import { cn } from '@rondo/ui/lib/utils';
import { IconSelector } from '@tabler/icons-react';
import { useId, useState, type FormEvent, type ReactNode } from 'react';

import { useTranslations } from '@/i18n/locale-context';
import type { MessageKey } from '@/i18n/messages';
import { monthLabel } from '@/lib/budget-month';
import { calendarLocale } from '@/lib/calendar-locale';
import type { MoneyReader } from '@/lib/money';

const NONE = 'NONE';

const HORIZON_YEARS = 60;

function firstOfMonth(month: CalendarMonth): Date {
  const [year = '', index = ''] = month.split('-');

  return new Date(Number(year), Number(index) - 1, 1);
}

function monthPicked(picked: Date): CalendarMonth {
  const year = picked.getFullYear();
  const index = String(picked.getMonth() + 1).padStart(2, '0');
  const day = String(picked.getDate()).padStart(2, '0');

  return monthOf(parseCalendarDate(`${year}-${index}-${day}`));
}

const ANSWERS: { value: string; label: MessageKey; note: MessageKey }[] = [
  { value: NONE, label: 'categories.goalNone', note: 'categories.goalNoneNote' },
  { value: 'REFILL_TO', label: 'categories.goalRefillTo', note: 'categories.goalRefillToNote' },
  {
    value: 'CONTRIBUTE',
    label: 'categories.goalContribute',
    note: 'categories.goalContributeNote',
  },
  { value: 'BY_DATE', label: 'categories.goalByDate', note: 'categories.goalByDateNote' },
  {
    value: 'ACCUMULATE',
    label: 'categories.goalAccumulate',
    note: 'categories.goalAccumulateNote',
  },
];

export interface TargetDraft {
  kind: TargetKind | null;
  amount: string;
  dueMonth: CalendarMonth | null;
  idempotencyKey: string;
}

export function TargetDialog({
  category,
  target,
  month,
  money,
  failed,
  busy,
  onSave,
  onCancel,
}: {
  category: { id: string; name: string };
  target: BudgetViewTargetDto | null;
  month: CalendarMonth;
  money: MoneyReader;
  failed: MessageKey | null;
  busy: boolean;
  onSave: (draft: TargetDraft) => void;
  onCancel: () => void;
}): ReactNode {
  const { t, locale } = useTranslations();
  const amountField = useId();
  const monthField = useId();

  const [key] = useState(() => crypto.randomUUID());
  const [answer, setAnswer] = useState<string>(target?.kind ?? NONE);
  const [amount, setAmount] = useState(() =>
    target === null ? '' : money.typed(parseMoney(target.amount)),
  );
  const [dueMonth, setDueMonth] = useState<CalendarMonth | null>(target?.dueMonth ?? null);
  const [picking, setPicking] = useState(false);

  const kind = isTargetKind(answer) ? answer : null;
  const due = dueMonth === null ? undefined : firstOfMonth(dueMonth);
  const opens = firstOfMonth(month);
  const horizon = new Date(opens.getFullYear() + HORIZON_YEARS, 11, 31);
  const minor = money.read(amount).minor;
  const ready =
    kind === null
      ? true
      : minor !== null && minor > 0n && (kind !== 'BY_DATE' || dueMonth !== null);

  const submit = (event: FormEvent): void => {
    event.preventDefault();

    if (busy || !ready) return;

    onSave({
      kind,
      amount: kind === null || minor === null ? '' : minor.toString(10),
      dueMonth: kind === 'BY_DATE' ? dueMonth : null,
      idempotencyKey: key,
    });
  };

  return (
    <form
      noValidate
      onSubmit={submit}
      data-testid="target-dialog"
      className="flex min-w-0 flex-col gap-5"
    >
      <h2 className="pe-10 text-base leading-tight font-medium">
        {t('categories.goalTitle', { category: category.name })}
      </h2>

      <RadioGroup value={answer} onValueChange={(next) => setAnswer(String(next))}>
        {ANSWERS.map((one) => (
          <Label
            key={one.value}
            className={cn(
              'hover:bg-muted/60 flex cursor-pointer items-start gap-3 rounded-2xl p-2.5',
              'transition-colors duration-[120ms]',
              answer === one.value && 'bg-muted',
            )}
          >
            <RadioGroupItem value={one.value} className="mt-0.5" />
            <span className="flex flex-col gap-0.5">
              <span className="text-sm leading-tight font-medium">{t(one.label)}</span>
              <span className="text-muted-foreground text-xs leading-snug font-normal">
                {t(one.note)}
              </span>
            </span>
          </Label>
        ))}
      </RadioGroup>

      {kind === null ? (
        <p className="bg-muted/60 text-muted-foreground rounded-2xl px-3.5 py-3 text-xs leading-snug">
          {t('categories.goalClosing')}
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor={amountField}>{t('categories.goalAmount')}</Label>
            <InputGroup>
              <InputGroupInput
                id={amountField}
                inputMode="decimal"
                autoComplete="off"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
              <InputGroupAddon align="inline-end">
                <InputGroupText>{money.symbol}</InputGroupText>
              </InputGroupAddon>
            </InputGroup>
          </div>

          {kind !== 'BY_DATE' ? null : (
            <div className="flex flex-col gap-2">
              <Label htmlFor={monthField}>{t('categories.goalDueMonth')}</Label>
              <Popover open={picking} onOpenChange={setPicking}>
                <PopoverTrigger
                  id={monthField}
                  aria-label={
                    dueMonth === null
                      ? t('categories.goalDueMonth')
                      : t('categories.goalDueMonthPicked', {
                          label: t('categories.goalDueMonth'),
                          month: monthLabel(dueMonth, locale),
                        })
                  }
                  className={cn(
                    'border-input dark:bg-input/30 flex h-9 w-full items-center justify-between',
                    'gap-2 rounded-xl border bg-transparent px-3 text-sm shadow-xs outline-none',
                    'focus-visible:border-ring focus-visible:ring-ring/40 focus-visible:ring-[3px]',
                    'transition-[color,box-shadow]',
                    dueMonth === null && 'text-muted-foreground',
                  )}
                >
                  {dueMonth === null ? t('categories.goalPickMonth') : monthLabel(dueMonth, locale)}
                  <IconSelector aria-hidden className="text-muted-foreground size-4 shrink-0" />
                </PopoverTrigger>
                <PopoverContent align="start" sideOffset={6} className="w-auto rounded-2xl p-0">
                  <Calendar
                    mode="single"
                    required
                    locale={calendarLocale(locale)}
                    labels={{
                      labelPrevious: () => t('common.calendarPrevious'),
                      labelNext: () => t('common.calendarNext'),
                      labelMonthDropdown: () => t('common.calendarMonth'),
                      labelYearDropdown: () => t('common.calendarYear'),
                    }}
                    captionLayout="dropdown"
                    formatters={{
                      formatMonthDropdown: (date) => date.toLocaleString(locale, { month: 'long' }),
                    }}
                    className="p-4 [--cell-size:--spacing(10)]"
                    selected={due}
                    onSelect={(picked: Date) => {
                      setDueMonth(monthPicked(picked));
                      setPicking(false);
                    }}
                    onMonthChange={(shown: Date) => setDueMonth(monthPicked(shown))}
                    defaultMonth={due ?? opens}
                    startMonth={opens}
                    endMonth={horizon}
                    disabled={{ before: opens }}
                  />
                </PopoverContent>
              </Popover>
            </div>
          )}
        </div>
      )}

      {failed === null ? null : (
        <p role="alert" className="text-destructive text-sm">
          {t(failed)}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          {t('categories.cancel')}
        </Button>
        <Button type="submit" disabled={busy || !ready}>
          {t('categories.save')}
        </Button>
      </div>
    </form>
  );
}
