export const locales = ['ru', 'en', 'pl'] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'en';

export function isLocale(value: string): value is Locale {
  return locales.some((locale) => locale === value);
}

export const localeLabels: Record<Locale, string> = {
  ru: 'Русский',
  en: 'English',
  pl: 'Polski',
};
