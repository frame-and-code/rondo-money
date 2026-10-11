'use client';

import { Button } from '@rondo/ui/components/ui/button';

import { useTranslations } from '@/i18n/locale-context';

export function SwitchBudgetDialog({
  name,
  failed,
  busy,
  onConfirm,
  onCancel,
}: {
  name: string;
  failed: boolean;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslations();

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div className="flex flex-col gap-1.5 pe-10">
        <h2 className="text-base leading-tight font-medium">
          {t('settings.budgetSwitchTitle', { name })}
        </h2>
        <p className="text-muted-foreground text-sm">{t('settings.budgetSwitchBody')}</p>
      </div>

      {failed ? (
        <p role="alert" className="text-destructive text-sm">
          <span className="font-medium">{t('settings.budgetFailedTitle')}</span>{' '}
          {t('settings.budgetFailed')}
        </p>
      ) : null}

      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>
          {t('settings.budgetSwitchCancel')}
        </Button>
        <Button type="button" disabled={busy} onClick={onConfirm}>
          {t('settings.budgetSwitchConfirm')}
        </Button>
      </div>
    </div>
  );
}
