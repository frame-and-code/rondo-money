'use client';

import { Alert, AlertDescription, AlertTitle } from '@rondo/ui/components/ui/alert';
import { IconAlertCircle } from '@tabler/icons-react';

import { useTranslations } from '@/i18n/locale-context';

import type { ReactNode } from 'react';

export function FailureAlert({ children }: { children: ReactNode }): ReactNode {
  const { t } = useTranslations();

  return (
    <Alert variant="destructive">
      <IconAlertCircle />
      <AlertTitle>{t('common.failTitle')}</AlertTitle>
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}
