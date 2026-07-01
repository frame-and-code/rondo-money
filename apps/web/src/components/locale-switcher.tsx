'use client';

import { Button } from '@ffai/ui/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@ffai/ui/components/ui/dropdown-menu';

import { useTranslations } from '@/i18n/locale-context';
import { localeLabels, locales } from '@/i18n/locales';

export function LocaleSwitcher() {
  const { locale, setLocale, t } = useTranslations();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" aria-label={t('common.localeSwitcher.ariaLabel')}>
          <span className="text-xs font-medium">{locale.toUpperCase()}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {locales.map((code) => (
          <DropdownMenuItem key={code} onClick={() => setLocale(code)}>
            {localeLabels[code]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
