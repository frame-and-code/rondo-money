import { detectBrowserLocale } from '@/i18n/detect-locale';

describe('detectBrowserLocale', () => {
  it('matches a supported primary subtag', () => {
    expect(detectBrowserLocale(['en-US', 'en'])).toBe('en');
  });

  it('matches a locale tag without a region subtag', () => {
    expect(detectBrowserLocale(['pl'])).toBe('pl');
  });

  it('falls back to the default locale when nothing matches', () => {
    expect(detectBrowserLocale(['de-DE', 'fr'])).toBe('en');
  });

  it('falls back to the default locale when given no preferred languages', () => {
    expect(detectBrowserLocale([])).toBe('en');
  });

  it('picks the first supported language in preference order', () => {
    expect(detectBrowserLocale(['de-DE', 'pl-PL', 'en-US'])).toBe('pl');
  });
});
