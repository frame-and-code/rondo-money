'use client';

import { Button } from '@ffai/ui/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@ffai/ui/components/ui/dropdown-menu';

import { useTranslations } from '@/i18n/locale-context';
import { localeLabels, locales, type Locale } from '@/i18n/locales';

interface Props {
  withLabel?: boolean;
}

export function LocaleSwitcher({ withLabel = false }: Props) {
  const { locale, setLocale, t } = useTranslations();

  return (
    <div>
      {withLabel && <span>{t('common.localeSwitcher.ariaLabel')}:&nbsp;</span>}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" aria-label={t('common.localeSwitcher.ariaLabel')}>
            <span className="text-xs font-medium">{locale.toUpperCase()}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuRadioGroup
            value={locale}
            onValueChange={(value) => setLocale(value as Locale)}
          >
            {locales.map((code) => (
              <DropdownMenuRadioItem key={code} value={code}>
                {localeLabels[code]}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
