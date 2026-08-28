'use client';

import { Button } from '@rondo/ui/components/ui/button';
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from '@rondo/ui/components/ui/combobox';
import { cn } from '@rondo/ui/lib/utils';
import { IconArrowDown, IconLoader, IconWallet } from '@tabler/icons-react';
import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';

import { useTranslations } from '@/i18n/locale-context';
import { categoryLook } from '@/lib/category-look';
import type { MoneyReader } from '@/lib/money';
import { POOL, type MoveTarget } from '@/lib/move-target';

function Envelope({ target }: { target: MoveTarget }) {
  const look = categoryLook(target.icon, target.color);
  const Icon = target.id === POOL ? IconWallet : look.Icon;
  const color = target.id === POOL ? 'var(--primary)' : look.color;

  return (
    <span
      aria-hidden
      className="grid size-5 shrink-0 place-items-center rounded-full"
      style={{ backgroundColor: `color-mix(in oklch, ${color} 12%, transparent)`, color }}
    >
      <Icon className="size-3" />
    </span>
  );
}

export function MoveFields({
  category,
  other,
  targets,
  outgoing,
  assigning,
  picking,
  draft,
  query,
  ready,
  saving,
  frozen,
  money,
  notice,
  large,
  onDraft,
  onQuery,
  onPicking,
  onChoose,
  onSwap,
  onCommit,
  onCancel,
}: {
  category: MoveTarget;
  other: MoveTarget;
  targets: readonly MoveTarget[];
  outgoing: boolean;
  assigning: boolean;
  picking: boolean;
  draft: string;
  query: string;
  ready: boolean;
  saving: boolean;
  frozen: boolean;
  money: MoneyReader;
  notice: ReactNode;
  large: boolean;
  onDraft: (value: string) => void;
  onQuery: (value: string) => void;
  onPicking: (open: boolean) => void;
  onChoose: (target: MoveTarget) => void;
  onSwap: () => void;
  onCommit: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslations();
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => {
    field.current?.focus();
  }, []);

  const locked = saving || frozen;
  const nameControl = cn(
    'hover:bg-foreground/6 aria-expanded:bg-foreground/6 -mx-2 -my-0.5 flex w-fit max-w-full',
    'items-center gap-1 rounded-full px-2 py-0.5',
    'transition-colors disabled:pointer-events-none disabled:opacity-50',
  );
  const amountField = (envelope: MoveTarget, ref?: typeof field) => (
    <input
      ref={ref}
      type="text"
      size={7}
      inputMode="text"
      aria-label={t('categories.moveAmountFor', { envelope: envelope.name })}
      placeholder={money.format(0n).replace(money.symbol, '').trim()}
      value={draft}
      disabled={locked}
      onChange={(event) => onDraft(event.target.value)}
      onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          onCommit();
        }
      }}
      className={cn(
        'field-sizing-content max-w-44 min-w-10 shrink border-0 bg-transparent p-0',
        'text-right text-lg font-semibold',
        'placeholder:text-muted-foreground tabular-nums outline-none',
        'disabled:opacity-50',
      )}
    />
  );

  const sign = (leaving: boolean) => (
    <span aria-hidden className="text-muted-foreground/50 text-base font-semibold">
      {leaving ? '−' : '+'}
    </span>
  );

  const balance = (envelope: MoveTarget) => (
    <span
      className={cn(
        'text-muted-foreground text-xs leading-tight tabular-nums',
        envelope.available < 0n && 'text-destructive',
      )}
    >
      {money.format(envelope.available)}
    </span>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3">
        <div className="bg-muted/60 flex items-center gap-2.5 rounded-full px-4 py-2.5">
          <Envelope target={category} />

          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate text-sm leading-tight font-medium">{category.name}</span>
            {balance(category)}
          </span>

          {sign(outgoing)}
          {amountField(category, field)}
        </div>

        <span className="z-10 -my-5 flex justify-center">
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label={t(outgoing ? 'categories.moveSwapIn' : 'categories.moveSwapOut')}
            disabled={locked}
            onClick={onSwap}
            className="bg-popover size-9 rounded-full shadow-sm dark:bg-popover"
          >
            <IconArrowDown
              data-testid="move-arrow"
              className={cn('size-4 transition-transform', !outgoing && 'rotate-180')}
            />
          </Button>
        </span>

        <div className="flex flex-col gap-2">
          <div className="bg-muted/60 flex items-center gap-2.5 rounded-full px-4 py-2.5">
            <Envelope target={other} />

            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <Combobox
                items={targets}
                value={other}
                onValueChange={(next: MoveTarget | null) => {
                  if (next !== null) onChoose(next);
                }}
                itemToStringLabel={(target: MoveTarget) => target.name}
                isItemEqualToValue={(left: MoveTarget, right: MoveTarget) => left.id === right.id}
                filter={null}
                inputValue={query}
                onInputValueChange={onQuery}
                open={picking}
                onOpenChange={onPicking}
              >
                <ComboboxTrigger
                  aria-label={t('categories.moveOther', { envelope: other.name })}
                  disabled={locked}
                  className={nameControl}
                >
                  <span className="truncate text-sm leading-tight font-medium">{other.name}</span>
                </ComboboxTrigger>
                <ComboboxContent
                  align="start"
                  sideOffset={8}
                  className="bg-popover min-w-72 before:hidden"
                >
                  <ComboboxInput placeholder={t('categories.moveSearch')} showTrigger={false} />
                  <ComboboxEmpty>{t('categories.moveNothing')}</ComboboxEmpty>
                  <ComboboxList>
                    {targets.map((target) => (
                      <ComboboxItem key={target.id} value={target}>
                        <Envelope target={target} />
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">
                          {target.name}
                        </span>
                        <span
                          className={cn(
                            'text-muted-foreground text-[13px] tabular-nums',
                            target.available < 0n && 'text-destructive',
                          )}
                        >
                          {money.format(target.available)}
                        </span>
                      </ComboboxItem>
                    ))}
                  </ComboboxList>
                </ComboboxContent>
              </Combobox>
              {balance(other)}
            </span>

            {sign(!outgoing)}
            {amountField(other)}
          </div>
        </div>
      </div>

      {notice}

      <div className={cn('flex gap-2 pt-0.5', large ? '' : 'justify-end')}>
        <Button
          type="button"
          variant={large ? 'outline' : 'ghost'}
          className={cn(large && 'h-11 flex-1 rounded-[22px]')}
          onClick={onCancel}
        >
          {t('categories.moveCancel')}
        </Button>
        <Button
          type="button"
          disabled={locked || !ready}
          className={cn(large && 'h-11 flex-1 rounded-[22px]')}
          onClick={onCommit}
        >
          {saving ? <IconLoader className="size-3.5 animate-spin" /> : null}
          {t(
            saving
              ? 'categories.moveSubmitting'
              : assigning
                ? 'categories.moveAssign'
                : 'categories.moveSubmit',
          )}
        </Button>
      </div>
    </div>
  );
}
