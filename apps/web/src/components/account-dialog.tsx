'use client';

import { type AccountType } from '@rondo/types';
import { Button } from '@rondo/ui/components/ui/button';
import { Input } from '@rondo/ui/components/ui/input';
import { Label } from '@rondo/ui/components/ui/label';
import { cn } from '@rondo/ui/lib/utils';
import { IconArchive, IconCash, IconCreditCard, IconLoader } from '@tabler/icons-react';
import { useEffect, useId, useRef, useState } from 'react';

import { MoneyField } from '@/components/money-field';
import { useTranslations } from '@/i18n/locale-context';
import { type MessageKey } from '@/i18n/messages';
import { type MoneyReader } from '@/lib/money';
import { keepsTheKey, type SaveFailureKind } from '@/lib/save-failure';

const FIELD =
  'bg-input/50 flex w-full items-center gap-2 rounded-2xl border border-transparent px-3.5 py-2 transition-colors focus-within:border-ring focus-within:ring-ring/30 focus-within:ring-3';

const TYPES: ReadonlyArray<{
  id: AccountType;
  Icon: typeof IconCash;
  title: MessageKey;
  body: MessageKey;
}> = [
  {
    id: 'DEBIT',
    Icon: IconCreditCard,
    title: 'newAccount.typeDebit',
    body: 'newAccount.typeDebitHint',
  },
  { id: 'CASH', Icon: IconCash, title: 'newAccount.typeCash', body: 'newAccount.typeCashHint' },
];

export interface AccountDraft {
  name: string;
  type: AccountType;
  initialBalance: string;
  idempotencyKey: string;
}

function mintKey(): string {
  return crypto.randomUUID();
}

export function AccountDialog({
  account,
  money,
  failure,
  busy,
  frozen,
  holds,
  onSave,
  onArchive,
  onEdited,
  onCancel,
}: {
  account: { id: string; name: string; type: AccountType } | null;
  money: MoneyReader;
  failure: SaveFailureKind | null;
  busy: boolean;
  frozen: boolean;
  holds: bigint;
  onSave: (draft: AccountDraft) => void;
  onArchive: () => void;
  onEdited: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslations();
  const nameField = useId();
  const balanceField = useId();

  const [key, setKey] = useState(mintKey);
  const [name, setName] = useState(account?.name ?? '');
  const [type, setType] = useState<AccountType>(account?.type ?? 'DEBIT');
  const [amount, setAmount] = useState('');
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
  const renaming = account !== null;
  const ready = name.trim() !== '' && (renaming || (read.minor !== null && !read.partial));

  const save = (): void => {
    if (!ready || read.minor === null) return;

    onSave({
      name: name.trim(),
      type,
      initialBalance: read.minor.toString(10),
      idempotencyKey: key,
    });
  };

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <h2 className="pe-10 text-base leading-tight font-medium">
        {t(renaming ? 'accounts.renameTitle' : 'accounts.createTitle')}
      </h2>

      <div className="flex flex-col gap-2">
        <Label htmlFor={nameField}>{t('newAccount.nameLabel')}</Label>
        <Input
          ref={field}
          id={nameField}
          value={name}
          maxLength={60}
          disabled={busy || frozen}
          onChange={(event) => {
            setName(event.target.value);
            edited();
          }}
        />
      </div>

      {renaming ? null : (
        <>
          <div className="flex flex-col gap-2">
            <span className="text-sm leading-none font-medium">{t('newAccount.typeLabel')}</span>
            <div className="grid grid-cols-2 gap-3">
              {TYPES.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={type === option.id}
                  disabled={busy || frozen}
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
                    <option.Icon className="size-4" />
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
            <Label htmlFor={balanceField}>{t('newAccount.balanceLabel')}</Label>
            <MoneyField
              id={balanceField}
              money={money}
              amount={amount}
              read={read}
              disabled={busy || frozen}
              hint={t('newAccount.balanceHint')}
              preview={(minor) => t('newAccount.balancePreview', { amount: money.format(minor) })}
              className={FIELD}
              onChange={(next) => {
                setAmount(next);
                edited();
              }}
            />
          </div>
        </>
      )}

      {!renaming ? null : (
        <div className="flex flex-col gap-1.5">
          <Button
            type="button"
            variant="ghost"
            className="text-destructive hover:text-destructive w-fit px-2"
            disabled={busy || frozen || holds !== 0n}
            onClick={onArchive}
          >
            <IconArchive className="size-4" />
            {t('accounts.archive')}
          </Button>

          {holds === 0n ? null : (
            <p className="text-muted-foreground text-xs">{t('accounts.archiveNeedsZero')}</p>
          )}
        </div>
      )}

      {failure === null ? null : (
        <p role="alert" className="text-destructive text-sm">
          {t(frozen ? 'accounts.saveLost' : 'accounts.saveFailed')}
        </p>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>
          {t('accounts.cancel')}
        </Button>
        <Button type="button" disabled={!ready || busy} onClick={save}>
          {busy ? <IconLoader className="size-4 animate-spin" /> : null}
          {t('accounts.save')}
        </Button>
      </div>
    </div>
  );
}
