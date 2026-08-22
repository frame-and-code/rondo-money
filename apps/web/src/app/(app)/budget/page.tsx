'use client';

import { useTranslations } from '@/i18n/locale-context';

export default function BudgetPage() {
  const { t } = useTranslations();

  return (
    <main>
      <h1>{t('budget.title')}</h1>
      <p>{t('budget.comingSoon')}</p>
    </main>
  );
}
