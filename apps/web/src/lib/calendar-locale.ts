import { enUS, pl, ru, type Locale as DateLocale } from 'date-fns/locale';

import { isLocale, type Locale } from '@/i18n/locales';

const CALENDAR_LOCALES: Record<Locale, DateLocale> = { ru, en: enUS, pl };

export function calendarLocale(locale: string): DateLocale {
  return isLocale(locale) ? CALENDAR_LOCALES[locale] : enUS;
}
