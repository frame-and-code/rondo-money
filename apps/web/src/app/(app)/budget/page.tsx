'use client';

import { useTranslations } from '@/i18n/locale-context';

// Placeholder budget screen at `/budget`, reserving the primary route for Phase 3.
// Real zero-based budgeting UI (categories, RTA, Available) is built out then.
// Left intentionally unstyled — styling is Tailwind + shadcn/ui (F0.6).
export default function BudgetPage() {
  const { t } = useTranslations();

  return (
    <main>
      <h1>{t('budget.title')}</h1>
      <p>{t('budget.comingSoon')}</p>
    </main>
  );
}
