import { defaultLocale, locales, type Locale } from './locales';

export function detectBrowserLocale(preferredLanguages: readonly string[]): Locale {
  for (const tag of preferredLanguages) {
    const primary = tag.split('-')[0]?.toLowerCase();
    const match = locales.find((locale) => locale === primary);
    if (match) return match;
  }
  return defaultLocale;
}
