'use client';

import { Button } from '@rondo/ui/components/ui/button';
import { cn } from '@rondo/ui/lib/utils';
import { IconAlertTriangle } from '@tabler/icons-react';

import { useTranslations } from '@/i18n/locale-context';
import type { MessageKey } from '@/i18n/messages';
import type { SaveFailure } from '@/lib/save-failure';

const TEXT: Record<SaveFailure['kind'], MessageKey> = {
  conflict: 'categories.failConflict',
  budget: 'categories.failBudget',
  network: 'categories.failNetwork',
  other: 'categories.failOther',
};

const ACTION: Record<SaveFailure['kind'], MessageKey | null> = {
  conflict: null,
  budget: 'categories.failRefresh',
  network: 'categories.failRetry',
  other: 'categories.failDismiss',
};

export function SaveFailureBanner({
  failure,
  className,
  onAction,
  onCancel,
}: {
  failure: SaveFailure;
  className?: string;
  onAction: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslations();
  const action = ACTION[failure.kind];

  return (
    <div
      role="alert"
      className={cn(
        'border-destructive/30 bg-destructive/8 mb-5 flex items-start gap-3 rounded-2xl border p-4',
        className,
      )}
    >
      <IconAlertTriangle className="text-destructive mt-0.5 size-[18px] shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-sm font-medium">{t('categories.failTitle')}</span>
        <span className="text-muted-foreground text-sm">
          {t(TEXT[failure.kind], { category: failure.categoryName })}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {failure.kind === 'network' ? (
          <Button type="button" variant="ghost" className="h-8" onClick={onCancel}>
            {t('categories.failCancel')}
          </Button>
        ) : null}
        {action === null ? null : (
          <Button type="button" variant="destructive" className="h-8" onClick={onAction}>
            {t(action)}
          </Button>
        )}
      </div>
    </div>
  );
}
