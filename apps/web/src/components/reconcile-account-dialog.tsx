'use client';

import { Alert, AlertDescription, AlertTitle } from '@rondo/ui/components/ui/alert';
import { Button } from '@rondo/ui/components/ui/button';
import { Label } from '@rondo/ui/components/ui/label';
import { cn } from '@rondo/ui/lib/utils';
import { IconAlertCircle, IconLoader } from '@tabler/icons-react';
import { useId, useState, type ReactNode } from 'react';

import { MoneyField, MONEY_FIELD } from '@/components/money-field';
import { useTranslations } from '@/i18n/locale-context';
import { type MessageKey } from '@/i18n/messages';
import { type MoneyReader } from '@/lib/money';
import { keepsTheKey, type SaveFailureKind } from '@/lib/save-failure';

const FIELD = cn(MONEY_FIELD, 'rounded-2xl px-3.5 py-2');

export interface ReconciliationDraft {
  balance: string;
  idempotencyKey: string;
}

function mintKey(): string {
  return crypto.randomUUID();
}

export function ReconcileAccountDialog({
  name,
  held,
  money,
  failed,
  failure,
  busy,
  onReconcile,
  onEdited,
  onCancel,
}: {
  name: string;
  held: bigint;
  money: MoneyReader;
  failed: MessageKey | null;
  failure: SaveFailureKind | null;
  busy: boolean;
  onReconcile: (draft: ReconciliationDraft) => void;
  onEdited: () => void;
  onCancel: () => void;
}): ReactNode {
  const { t } = useTranslations();
  const balanceField = useId();

  const [key, setKey] = useState(mintKey);
  const [amount, setAmount] = useState('');

  const read = money.read(amount);
  const frozen = failure !== null && keepsTheKey(failure);
  const ready = read.typed && read.minor !== null && !read.partial;

  const edited = (): void => {
    if (failure === null || keepsTheKey(failure)) return;

    setKey(mintKey());
    onEdited();
  };

  const send = (): void => {
    if (!ready || read.minor === null) return;

    onReconcile({ balance: read.minor.toString(10), idempotencyKey: key });
  };

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div className="flex flex-col gap-1.5 pe-10">
        <h2 className="text-base leading-tight font-medium">
          {t('accounts.reconcileTitle', { name })}
        </h2>
        <p className="text-muted-foreground text-sm">{t('accounts.reconcileBody')}</p>
      </div>

      <div className="flex items-baseline justify-between gap-3">
        <span className="text-muted-foreground text-sm">{t('accounts.reconcileComputed')}</span>
        <span className={cn('text-sm font-medium tabular-nums', held < 0n && 'text-destructive')}>
          {money.format(held)}
        </span>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={balanceField}>{t('accounts.reconcileLabel')}</Label>
        <MoneyField
          id={balanceField}
          money={money}
          amount={amount}
          read={read}
          disabled={busy || frozen}
          className={FIELD}
          preview={(minor) =>
            minor - held === 0n
              ? t('accounts.reconcileNoDifference')
              : t('accounts.reconcileWillWrite', { amount: money.format(minor - held) })
          }
          onChange={(next) => {
            setAmount(next);
            edited();
          }}
        />
      </div>

      {failed === null ? null : (
        <Alert variant="destructive">
          <IconAlertCircle />
          <AlertTitle>{t('accounts.reconcile')}</AlertTitle>
          <AlertDescription>{t(frozen ? 'accounts.saveLost' : failed)}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>
          {t('accounts.cancel')}
        </Button>
        <Button type="button" disabled={!ready || busy} onClick={send}>
          {busy ? <IconLoader className="size-4 animate-spin" /> : null}
          {t('accounts.reconcileConfirm')}
        </Button>
      </div>
    </div>
  );
}
