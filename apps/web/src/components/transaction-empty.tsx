'use client';

import { Button } from '@rondo/ui/components/ui/button';
import { Card, CardContent } from '@rondo/ui/components/ui/card';
import { IconPlus } from '@tabler/icons-react';
import { type ReactNode } from 'react';

import { useTranslations } from '@/i18n/locale-context';

export function AddTodayRow({ heading, onAdd }: { heading: string; onAdd: () => void }): ReactNode {
  const { t } = useTranslations();

  return (
    <section className="flex flex-col gap-1.5">
      <header className="flex items-baseline gap-3 px-4">
        <h3 className="flex-1 text-sm font-medium">{heading}</h3>
        <span className="text-muted-foreground text-xs">{t('transactions.dayEmpty')}</span>
        <span aria-hidden className="hidden size-8 shrink-0 sm:block" />
      </header>

      <button
        type="button"
        onClick={onAdd}
        className="border-border text-muted-foreground hover:bg-card flex items-center gap-3 rounded-2xl border border-dashed px-4 py-3 text-left text-sm"
      >
        <span className="bg-secondary grid size-9 shrink-0 place-items-center rounded-full">
          <IconPlus aria-hidden className="size-4.5" />
        </span>
        {t('transactions.addToday')}
      </button>
    </section>
  );
}

export function TransactionEmpty({
  filtered,
  onReset,
}: {
  filtered: boolean;
  onReset: () => void;
}): ReactNode {
  const { t } = useTranslations();

  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
        <p className="text-sm font-medium">
          {t(filtered ? 'transactions.emptyFiltered' : 'transactions.empty')}
        </p>
        {filtered ? (
          <Button type="button" variant="ghost" className="h-8 rounded-2xl px-3" onClick={onReset}>
            {t('transactions.resetFilters')}
          </Button>
        ) : (
          <p className="text-muted-foreground max-w-sm text-xs">{t('transactions.emptyHint')}</p>
        )}
      </CardContent>
    </Card>
  );
}
