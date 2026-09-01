'use client';

import { Alert, AlertDescription, AlertTitle } from '@rondo/ui/components/ui/alert';
import { Button } from '@rondo/ui/components/ui/button';
import { IconAlertCircle } from '@tabler/icons-react';
import { type ReactNode } from 'react';

import { useTranslations } from '@/i18n/locale-context';
import type { MessageKey } from '@/i18n/messages';

export function ArchiveAccountDialog({
  name,
  failed,
  busy,
  onArchive,
  onCancel,
}: {
  name: string;
  failed: MessageKey | null;
  busy: boolean;
  onArchive: () => void;
  onCancel: () => void;
}): ReactNode {
  const { t } = useTranslations();

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div className="flex flex-col gap-1.5 pe-10">
        <h2 className="text-base leading-tight font-medium">
          {t('accounts.archiveTitle', { name })}
        </h2>
        <p className="text-muted-foreground text-sm">{t('accounts.archiveBody')}</p>
      </div>

      {failed === null ? null : (
        <Alert variant="destructive">
          <IconAlertCircle />
          <AlertTitle>{t('accounts.archive')}</AlertTitle>
          <AlertDescription>{t(failed)}</AlertDescription>
        </Alert>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" className="rounded-2xl" onClick={onCancel}>
          {t('accounts.cancel')}
        </Button>
        <Button
          type="button"
          variant="destructive"
          className="rounded-2xl"
          disabled={busy}
          onClick={onArchive}
        >
          {t('accounts.archiveConfirm')}
        </Button>
      </div>
    </div>
  );
}
