import { detectLanguageTag } from '@/user-settings/accept-language';

/**
 * Unit level (F0.8): the header parser on its own, which is where every odd shape a real
 * browser sends is cheap to pin down. Enumerated rather than property-based — the input space
 * that matters here is named (three languages, a handful of malformed forms), and
 * `docs/testing.md` reserves fast-check for the invariants where it is not.
 */
describe('detectLanguageTag', () => {
  it('takes the primary subtag, ignoring region and case', () => {
    expect(detectLanguageTag('en-GB')).toBe('en');
    expect(detectLanguageTag('PL')).toBe('pl');
    expect(detectLanguageTag('RU-ru')).toBe('ru');
  });

  it('prefers the highest q-value, not the first entry', () => {
    // The order a client writes is not the order it means: `de` comes first and is weighted
    // above `pl`, but we do not ship German, so `pl` is what it actually asked us for.
    expect(detectLanguageTag('de;q=0.9,pl;q=0.8')).toBe('pl');
    expect(detectLanguageTag('en;q=0.5,pl;q=0.9')).toBe('pl');
  });

  it('keeps the written order between entries of equal weight', () => {
    expect(detectLanguageTag('pl,en')).toBe('pl');
    expect(detectLanguageTag('en,pl')).toBe('en');
    // An entry with no `q` is weight 1, so it outranks a weighted one written before it.
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
    // …but a wildcard alongside a real preference must not swallow it.
    expect(detectLanguageTag('*;q=0.5,pl;q=0.4')).toBe('pl');
  });

  it('falls back to English for an empty or absent header', () => {
    expect(detectLanguageTag(undefined)).toBe('en');
    expect(detectLanguageTag('')).toBe('en');
    expect(detectLanguageTag('   ')).toBe('en');
  });

  it('ignores an entry the client refused (q=0) or wrote incorrectly', () => {
    // q=0 is "not acceptable" in RFC 9110 — honouring it as a preference would serve exactly
    // the language the client asked us not to.
    expect(detectLanguageTag('pl;q=0,en;q=0.1')).toBe('en');
    expect(detectLanguageTag('pl;q=0')).toBe('en');
    // A malformed weight drops the entry rather than defaulting it to 1, which would let it
    // outrank everything the client did state properly.
    expect(detectLanguageTag('pl;q=nonsense,ru;q=0.1')).toBe('ru');
  });

  it('ignores parameters other than q', () => {
    expect(detectLanguageTag('pl;charset=utf-8')).toBe('pl');
  });
});
