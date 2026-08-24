import { locales } from '@/i18n/locales';
import { messages } from '@/i18n/messages';
import {
  NAME_PLACEHOLDER_COUNT,
  namePlaceholderKey,
  pickNamePlaceholderIndex,
} from '@/i18n/name-placeholders';

describe('the budget name placeholder', () => {
  it('offers more than one example, so the field does not read as a required format', () => {
    expect(NAME_PLACEHOLDER_COUNT).toBeGreaterThan(1);
  });

  it('names a key every dictionary answers, for every index in range', () => {
    for (let index = 0; index < NAME_PLACEHOLDER_COUNT; index += 1) {
      const key = namePlaceholderKey(index);

      for (const locale of locales) {
        expect(messages[locale][key]).toBeTruthy();
      }
    }
  });

  it('folds an index out of range instead of naming a key nobody wrote', () => {
    expect(namePlaceholderKey(NAME_PLACEHOLDER_COUNT)).toBe(namePlaceholderKey(0));
    expect(namePlaceholderKey(NAME_PLACEHOLDER_COUNT * 3 + 2)).toBe(namePlaceholderKey(2));
    expect(namePlaceholderKey(-1)).toBe(namePlaceholderKey(NAME_PLACEHOLDER_COUNT - 1));
    expect(messages.ru[namePlaceholderKey(1_000_000)]).toBeTruthy();
  });

  it('picks an index the dictionaries can answer', () => {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const index = pickNamePlaceholderIndex();

      expect(Number.isInteger(index)).toBe(true);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(NAME_PLACEHOLDER_COUNT);
    }
  });

  it('does not always pick the same example, or the server may as well send a constant', () => {
    const picked = new Set(Array.from({ length: 200 }, pickNamePlaceholderIndex));

    expect(picked.size).toBeGreaterThan(1);
  });
});
