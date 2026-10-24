'use client';

import { buttonVariants } from '@rondo/ui/components/ui/button';
import { cn } from '@rondo/ui/lib/utils';
import Link from 'next/link';

import { useTranslations } from '@/i18n/locale-context';
import { onboardingRoute } from '@/lib/onboarding';

export function NewBudgetDialog({ activeId }: { activeId: string }) {
  const { t } = useTranslations();
  const fresh = onboardingRoute('budget');

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div className="flex flex-col gap-1.5 pe-10">
        <h2 className="text-base leading-tight font-medium">{t('settings.budgetNewTitle')}</h2>
        <p className="text-muted-foreground text-sm">{t('settings.budgetNewBody')}</p>
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        <Link href={fresh} className={cn(buttonVariants({ variant: 'outline' }))}>
          {t('settings.budgetNewClean')}
        </Link>
        <Link href={`${fresh}?from=${activeId}`} className={cn(buttonVariants())}>
          {t('settings.budgetNewFrom')}
        </Link>
      </div>
    </div>
  );
}
