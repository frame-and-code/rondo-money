import { detectLanguageTag } from '@/user-settings/accept-language';

describe('detectLanguageTag', () => {
  it('takes the primary subtag, ignoring region and case', () => {
    expect(detectLanguageTag('en-GB')).toBe('en');
    expect(detectLanguageTag('PL')).toBe('pl');
    expect(detectLanguageTag('RU-ru')).toBe('ru');
  });

  it('prefers the highest q-value, not the first entry', () => {
    expect(detectLanguageTag('de;q=0.9,pl;q=0.8')).toBe('pl');
    expect(detectLanguageTag('en;q=0.5,pl;q=0.9')).toBe('pl');
  });

  it('keeps the written order between entries of equal weight', () => {
    expect(detectLanguageTag('pl,en')).toBe('pl');
    expect(detectLanguageTag('en,pl')).toBe('en');
    expect(detectLanguageTag('en;q=0.8,pl')).toBe('pl');
  });

  it('tolerates the whitespace real headers carry', () => {
    expect(detectLanguageTag('de-DE, pl;q=0.7 , en;q=0.3')).toBe('pl');
  });

  it('falls back to English when nothing is supported', () => {
    expect(detectLanguageTag('de')).toBe('en');
    expect(detectLanguageTag('fr-FR,de-DE;q=0.8')).toBe('en');
  });

  it('falls back to English for a wildcard, which names no language', () => {
    expect(detectLanguageTag('*')).toBe('en');
    expect(detectLanguageTag('*;q=0.5,pl;q=0.4')).toBe('pl');
  });

  it('falls back to English for an empty or absent header', () => {
    expect(detectLanguageTag(undefined)).toBe('en');
    expect(detectLanguageTag('')).toBe('en');
    expect(detectLanguageTag('   ')).toBe('en');
  });

  it('ignores an entry the client refused (q=0) or wrote incorrectly', () => {
    expect(detectLanguageTag('pl;q=0,en;q=0.1')).toBe('en');
    expect(detectLanguageTag('pl;q=0')).toBe('en');
    expect(detectLanguageTag('pl;q=nonsense,ru;q=0.1')).toBe('ru');
    expect(detectLanguageTag('pl;q=0.9junk,en;q=0.8')).toBe('en');
    expect(detectLanguageTag('pl;q=2,en;q=1')).toBe('en');
    expect(detectLanguageTag('pl;q=1.5,en;q=0.4')).toBe('en');
  });

  it('ignores parameters other than q', () => {
    expect(detectLanguageTag('pl;charset=utf-8')).toBe('pl');
  });

  it('reads a weight written with spaces around the equals sign', () => {
    expect(detectLanguageTag('pl;q = 0,en;q=0.5')).toBe('en');
    expect(detectLanguageTag('en;q = 0.2,pl;q = 0.9')).toBe('pl');
  });

  it('accepts every weight the grammar does allow', () => {
    expect(detectLanguageTag('en;q=1,pl;q=1.000')).toBe('en');
    expect(detectLanguageTag('en;q=0.001,pl;q=0.002')).toBe('pl');
    expect(detectLanguageTag('en;q=0.5,pl;q=1')).toBe('pl');
  });
});
