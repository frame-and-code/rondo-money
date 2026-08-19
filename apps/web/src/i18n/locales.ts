export const locales = ['ru', 'en', 'pl'] as const;

export type Locale = (typeof locales)[number];

// English, not Russian. The PRD stays the RU source of truth, but that is a document we
// write, not the interface a stranger's browser asks for — so an unrecognised language
// lands on English here exactly as it does in the API (F1.6, superseding the RU-first
// default of F0.7). The two fallbacks have to agree: they answer the same question one
// round-trip apart.
export const defaultLocale: Locale = 'en';

/** Narrows an arbitrary string — a stored value, a dropdown's `value` — to a supported locale. */
export function isLocale(value: string): value is Locale {
  return locales.some((locale) => locale === value);
}

// Endonyms shown in the locale switcher. Deliberately not run through the translation
// dictionaries below: a language's own name doesn't change with the active locale.
export const localeLabels: Record<Locale, string> = {
  ru: 'Русский',
  en: 'English',
  pl: 'Polski',
};
