'use client';

import { parseMoney, type CalendarDate, type NetWorthItemDto } from '@rondo/types';
import { Alert, AlertDescription, AlertTitle } from '@rondo/ui/components/ui/alert';
import { Button } from '@rondo/ui/components/ui/button';
import { Calendar } from '@rondo/ui/components/ui/calendar';
import { Input } from '@rondo/ui/components/ui/input';
import { Label } from '@rondo/ui/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@rondo/ui/components/ui/popover';
import { cn } from '@rondo/ui/lib/utils';
import { IconAlertCircle, IconCalendar, IconCheck, IconLoader, IconX } from '@tabler/icons-react';
import { format } from 'date-fns';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

import { MONEY_FIELD, MoneyField } from '@/components/money-field';
import { useTranslations } from '@/i18n/locale-context';
import { type MessageKey } from '@/i18n/messages';
import { dateOf, dayOf } from '@/lib/calendar-day';
import { calendarLocale } from '@/lib/calendar-locale';
import { type MoneyReader } from '@/lib/money';
import { keepsTheKey, type SaveFailureKind } from '@/lib/save-failure';

export type NetWorthEntity = 'asset' | 'liability';

export type NetWorthItem = NetWorthItemDto;

export interface NetWorthItemDraft {
  name: string;
  amount: string;
  date: CalendarDate;
  idempotencyKey: string;
}

const FIELD = cn(MONEY_FIELD, 'rounded-2xl px-3.5 py-2');

const TITLES: Record<NetWorthEntity, { create: MessageKey; edit: MessageKey; hint: MessageKey }> = {
  asset: {
    create: 'netWorth.newAsset',
    edit: 'netWorth.editAsset',
    hint: 'netWorth.nameHintAsset',
  },
  liability: {
    create: 'netWorth.newLiability',
    edit: 'netWorth.editLiability',
    hint: 'netWorth.nameHintLiability',
  },
};

export function netWorthFormTitle(entity: NetWorthEntity, editing: boolean): MessageKey {
  return editing ? TITLES[entity].edit : TITLES[entity].create;
}

function mintKey(): string {
  return crypto.randomUUID();
}

export function NetWorthItemDialog({
  entity,
  item,
  money,
  today,
  failure,
  busy,
  frozen,
  onSave,
  onEdited,
  onCancel,
}: {
  entity: NetWorthEntity;
  item: NetWorthItem | null;
  money: MoneyReader;
  today: CalendarDate;
  failure: SaveFailureKind | null;
  busy: boolean;
  frozen: boolean;
  onSave: (draft: NetWorthItemDraft) => void;
  onEdited: () => void;
  onCancel: () => void;
}): ReactNode {
  const { t, locale } = useTranslations();
  const nameField = useId();
  const amountField = useId();

  const [key, setKey] = useState(mintKey);
  const [name, setName] = useState(item?.name ?? '');
  const [amount, setAmount] = useState(() =>
    item === null ? '' : money.typed(parseMoney(item.amount)),
  );
  const [date, setDate] = useState<CalendarDate>(item?.date ?? today);
  const [picking, setPicking] = useState(false);
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const node = field.current;
    if (node === null) return;

    node.focus();
    node.setSelectionRange(node.value.length, node.value.length);
  }, []);

  const edited = (): void => {
    if (failure === null || keepsTheKey(failure)) return;

    setKey(mintKey());
    onEdited();
  };

  const read = money.read(amount);
  const held = busy || frozen;
  const ready =
    name.trim() !== '' && read.fault === null && !read.partial && read.minor !== null && read.typed;

  const save = (): void => {
    if (!ready || busy || read.minor === null) return;

    onSave({
      name: name.trim(),
      amount: read.minor.toString(10),
      date,
      idempotencyKey: key,
    });
  };

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <h2 className="pe-10 text-base leading-tight font-medium">
        {t(netWorthFormTitle(entity, item !== null))}
      </h2>

      <div className="flex flex-col gap-2">
        <Label htmlFor={nameField}>{t('netWorth.nameLabel')}</Label>
        <Input
          ref={field}
          id={nameField}
          value={name}
          maxLength={60}
          placeholder={t(TITLES[entity].hint)}
          disabled={held}
          onChange={(event) => {
            setName(event.target.value);
            edited();
          }}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={amountField}>{t('netWorth.amountLabel')}</Label>
        <MoneyField
          id={amountField}
          money={money}
          amount={amount}
          read={read}
          disabled={held}
          negativeText={t('netWorth.amountNegative')}
          className={FIELD}
          onChange={(next) => {
            setAmount(next);
            edited();
          }}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label>{t('netWorth.dateLabel')}</Label>
        <Popover open={picking} onOpenChange={setPicking}>
          <PopoverTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                disabled={held}
                className={cn(FIELD, 'h-auto justify-start gap-2 font-normal')}
              >
                <IconCalendar className="text-muted-foreground size-4" />
                <span className="flex-1 text-left">
                  {format(dayOf(date), 'd MMMM yyyy', { locale: calendarLocale(locale) })}
                </span>
              </Button>
            }
          />
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={dayOf(date)}
              defaultMonth={dayOf(date)}
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

      {failure === null ? null : (
        <Alert variant="destructive">
          <IconAlertCircle />
          <AlertTitle>{t('netWorth.failTitle')}</AlertTitle>
          <AlertDescription>{t('netWorth.failBody')}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          <IconX data-icon="inline-start" />
          {t('netWorth.cancel')}
        </Button>
        <Button type="button" disabled={!ready || busy} onClick={save}>
          {busy ? (
            <IconLoader data-icon="inline-start" className="animate-spin" />
          ) : (
            <IconCheck data-icon="inline-start" />
          )}
          {t('netWorth.save')}
        </Button>
      </div>
    </div>
  );
}
