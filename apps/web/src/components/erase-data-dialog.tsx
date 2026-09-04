'use client';

import { Alert, AlertDescription, AlertTitle } from '@rondo/ui/components/ui/alert';
import { Button } from '@rondo/ui/components/ui/button';
import { Input } from '@rondo/ui/components/ui/input';
import { Label } from '@rondo/ui/components/ui/label';
import { IconAlertCircle } from '@tabler/icons-react';
import { useId, useState, type ReactNode } from 'react';

import { useTranslations } from '@/i18n/locale-context';
import type { MessageKey } from '@/i18n/messages';

export type EraseIntent = 'reset' | 'delete';

interface Wording {
  title: MessageKey;
  body: MessageKey;
  phrase: MessageKey;
  confirm: MessageKey;
}

const WORDING: Record<EraseIntent, Wording> = {
  reset: {
    title: 'settings.resetTitle',
    body: 'settings.resetBody',
    phrase: 'settings.resetPhrase',
    confirm: 'settings.resetConfirm',
  },
  delete: {
    title: 'settings.deleteTitle',
    body: 'settings.deleteBody',
    phrase: 'settings.deletePhrase',
    confirm: 'settings.deleteConfirm',
  },
};

export function EraseDataDialog({
  intent,
  failed,
  busy,
  onConfirm,
  onCancel,
}: {
  intent: EraseIntent;
  failed: MessageKey | null;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}): ReactNode {
  const { t } = useTranslations();
  const field = useId();
  const [typed, setTyped] = useState('');

  const wording = WORDING[intent];
  const phrase = t(wording.phrase);

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div className="flex flex-col gap-1.5 pe-10">
        <h2 className="text-base leading-tight font-medium">{t(wording.title)}</h2>
        <p className="text-muted-foreground text-sm">{t(wording.body)}</p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={field}>{t('settings.erasePhraseLabel', { phrase })}</Label>
        <Input
          id={field}
          value={typed}
          autoComplete="off"
          onChange={(event) => setTyped(event.target.value)}
        />
      </div>

      {failed === null ? null : (
        <Alert variant="destructive">
          <IconAlertCircle />
          <AlertTitle>{t(wording.title)}</AlertTitle>
          <AlertDescription>{t(failed)}</AlertDescription>
        </Alert>
      )}

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          className="rounded-2xl"
          disabled={busy}
          onClick={onCancel}
        >
          {t('settings.eraseCancel')}
        </Button>
        <Button
          type="button"
          variant="destructive"
          className="rounded-2xl"
          disabled={busy || typed.trim() !== phrase}
          onClick={onConfirm}
        >
          {t(wording.confirm)}
        </Button>
      </div>
    </div>
  );
}
