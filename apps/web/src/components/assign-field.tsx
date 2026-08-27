'use client';

import { Button } from '@rondo/ui/components/ui/button';
import { cn } from '@rondo/ui/lib/utils';
import { IconAlertTriangle, IconCheck, IconLoader, IconX } from '@tabler/icons-react';
import { useEffect, useRef, type KeyboardEvent } from 'react';

import { useTranslations } from '@/i18n/locale-context';
import type { MoneyReader } from '@/lib/money';

const FIELD = 'h-8 w-29 rounded-2xl px-2.5 text-[15px] font-medium tabular-nums md:text-[13px]';

export function AssignField({
  category,
  assigned,
  money,
  editing,
  draft,
  saving,
  failed,
  onOpen,
  onDraft,
  onCommit,
  onCancel,
}: {
  category: string;
  assigned: bigint;
  money: MoneyReader;
  editing: boolean;
  draft: string;
  saving: boolean;
  failed: boolean;
  onOpen: () => void;
  onDraft: (value: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslations();
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      field.current?.focus();
      field.current?.select();
    }
  }, [editing]);

  if (editing) {
    return (
      <span className="flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-6"
          aria-label={t('categories.assignCancel')}
          onMouseDown={(event) => event.preventDefault()}
          onClick={onCancel}
        >
          <IconX className="size-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="text-primary size-6"
          aria-label={t('categories.assignSave')}
          onMouseDown={(event) => event.preventDefault()}
          onClick={onCommit}
        >
          <IconCheck className="size-4" />
        </Button>
        <input
          ref={field}
          type="text"
          inputMode="decimal"
          aria-label={t('categories.assignField')}
          value={draft}
          disabled={saving}
          onChange={(event) => onDraft(event.target.value)}
          onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              onCommit();
            }
            if (event.key === 'Escape') {
              event.preventDefault();
              onCancel();
            }
          }}
          className={cn(
            FIELD,
            'border-ring bg-input/50 focus-visible:ring-ring/30 border text-right outline-none',
            'ring-ring/30 ring-3 disabled:opacity-50',
          )}
        />
      </span>
    );
  }

  return (
    <button
      type="button"
      aria-label={t('categories.assignEdit', { category })}
      onClick={onOpen}
      className={cn(
        FIELD,
        'hover:bg-background flex cursor-text items-center justify-end gap-1.5',
        'transition-[background-color,box-shadow] duration-[120ms]',
        'hover:shadow-[inset_0_0_0_1px_var(--border)]',
        assigned === 0n && 'text-muted-foreground',
      )}
    >
      {saving ? <IconLoader className="text-muted-foreground size-3 animate-spin" /> : null}
      {failed ? <IconAlertTriangle className="text-destructive size-3.5" /> : null}
      {money.format(assigned)}
    </button>
  );
}
