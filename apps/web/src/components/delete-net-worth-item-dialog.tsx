'use client';

import { Alert, AlertDescription, AlertTitle } from '@rondo/ui/components/ui/alert';
import { Button } from '@rondo/ui/components/ui/button';
import { IconAlertCircle, IconTrash, IconX } from '@tabler/icons-react';
import { useEffect, useState, type ReactNode } from 'react';

import { type NetWorthEntity } from '@/components/net-worth-item-dialog';
import { useTranslations } from '@/i18n/locale-context';
import { type MessageKey } from '@/i18n/messages';

const WORDS: Record<NetWorthEntity, { title: MessageKey; line: MessageKey }> = {
  asset: { title: 'netWorth.deleteAssetTitle', line: 'netWorth.deleteAssetLine' },
  liability: { title: 'netWorth.deleteLiabilityTitle', line: 'netWorth.deleteLiabilityLine' },
};

export function netWorthDeleteTitle(entity: NetWorthEntity): MessageKey {
  return WORDS[entity].title;
}

export function DeleteNetWorthItemDialog({
  entity,
  name,
  amount,
  failed,
  refusals,
  busy,
  onDelete,
  onCancel,
}: {
  entity: NetWorthEntity;
  name: string;
  amount: string;
  failed: boolean;
  refusals: number;
  busy: boolean;
  onDelete: () => void;
  onCancel: () => void;
}): ReactNode {
  const { t } = useTranslations();
  const [asked, setAsked] = useState(false);

  useEffect(() => {
    if (!busy) setAsked(false);
  }, [busy, refusals]);

  const press = (): void => {
    if (busy || asked) return;

    setAsked(true);
    onDelete();
  };

  return (
    <div className="flex flex-col gap-4">
      <h2 className="pe-10 text-lg font-semibold">{t(WORDS[entity].title, { name })}</h2>

      <ul className="text-muted-foreground flex flex-col gap-1 text-sm">
        <li>{t(WORDS[entity].line, { amount })}</li>
        <li>{t('netWorth.deleteNote')}</li>
      </ul>

      {failed ? (
        <Alert variant="destructive">
          <IconAlertCircle />
          <AlertTitle>{t('netWorth.failTitle')}</AlertTitle>
          <AlertDescription>{t('netWorth.failBody')}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          <IconX data-icon="inline-start" />
          {t('netWorth.cancel')}
        </Button>
        <Button type="button" variant="destructive" disabled={busy || asked} onClick={press}>
          <IconTrash data-icon="inline-start" />
          {t('netWorth.delete')}
        </Button>
      </div>
    </div>
  );
}
