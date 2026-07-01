import { defaultLocale, locales, type Locale } from './locales';

// Matches each browser-preferred tag (e.g. "en-US", "pl") against our supported
// locales by comparing just the primary subtag, in the browser's preference order.
export function detectBrowserLocale(preferredLanguages: readonly string[]): Locale {
  for (const tag of preferredLanguages) {
    const primary = tag.split('-')[0]?.toLowerCase();
    const match = locales.find((locale) => locale === primary);
    if (match) return match;
  }
  return defaultLocale;
}
