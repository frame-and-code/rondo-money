'use client';

import { Button } from '@rondo/ui/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@rondo/ui/components/ui/dropdown-menu';

import { useTranslations } from '@/i18n/locale-context';
import { isLocale, localeLabels, locales } from '@/i18n/locales';

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
        <DropdownMenuRadioGroup
          value={locale}
          onValueChange={(value) => {
            // Radix types its value as a bare string; narrowed rather than cast, so a locale
            // removed from `locales` fails here instead of reaching `messages[locale]`.
            if (isLocale(value)) setLocale(value);
          }}
        >
          {locales.map((code) => (
            <DropdownMenuRadioItem key={code} value={code}>
              {localeLabels[code]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
