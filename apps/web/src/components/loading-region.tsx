'use client';

import { useTranslations } from '@/i18n/locale-context';

import type { ReactNode } from 'react';

export function LoadingRegion({ children }: { children: ReactNode }) {
  const { t } = useTranslations();

  return (
    <div role="status" aria-label={t('common.loading')} className="flex flex-col gap-4">
      <span className="sr-only">{t('common.loading')}</span>
      {children}
    </div>
  );
}
