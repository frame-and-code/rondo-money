'use client';

import { Button } from '@rondo/ui/components/ui/button';
import { IconCircleCheck } from '@tabler/icons-react';

import { useTranslations } from '@/i18n/locale-context';
import type { MessageKey } from '@/i18n/messages';

export function PaidDialog({
  category,
  failed,
  busy = false,
  onConfirm,
  onCancel,
}: {
  category: { id: string; name: string };
  failed: MessageKey | null;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslations();

  return (
    <div className="flex min-w-0 flex-col gap-5" data-testid="paid-dialog">
      <div className="flex flex-col gap-1.5 pe-10">
        <h2 className="text-base leading-tight font-medium">
          {t('categories.paidTitle', { category: category.name })}
        </h2>
        <p className="text-muted-foreground text-sm">{t('categories.paidBody')}</p>
      </div>

      {failed === null ? null : (
        <p role="alert" className="text-destructive text-sm">
          {t(failed)}
        </p>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          {t('categories.cancel')}
        </Button>
        <Button type="button" disabled={busy} onClick={onConfirm}>
          <IconCircleCheck aria-hidden className="size-4" />
          {t('categories.paidConfirm')}
        </Button>
      </div>
    </div>
  );
}
