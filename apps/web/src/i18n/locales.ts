export const locales = ['ru', 'en', 'pl'] as const;

export type Locale = (typeof locales)[number];

// Product is RU-first (PRD is the RU source of truth) — used whenever the browser's
// language can't be matched to a supported locale.
export const defaultLocale: Locale = 'ru';

// Endonyms shown in the locale switcher. Deliberately not run through the translation
// dictionaries below: a language's own name doesn't change with the active locale.
export const localeLabels: Record<Locale, string> = {
  ru: 'Русский',
  en: 'English',
  pl: 'Polski',
};
