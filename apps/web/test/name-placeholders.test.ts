import { locales } from '@/i18n/locales';
import { messages } from '@/i18n/messages';
import {
  ACCOUNT_PLACEHOLDER_COUNT,
  accountNamePlaceholderKey,
  BUDGET_PLACEHOLDER_COUNT,
  namePlaceholderKey,
  pickNamePlaceholderIndex,
} from '@/i18n/name-placeholders';

const SETS = [
  ['the budget name', namePlaceholderKey, BUDGET_PLACEHOLDER_COUNT],
  ['the account name', accountNamePlaceholderKey, ACCOUNT_PLACEHOLDER_COUNT],
] as const;

describe.each(SETS)('%s placeholder', (_set, keyAt, count) => {
  it('offers more than one example, so the field does not read as a required format', () => {
    expect(count).toBeGreaterThan(1);
  });

  it('names a key of its own set, so the two never hand out each other examples', () => {
    expect(keyAt(0)).not.toBe(
      keyAt === namePlaceholderKey ? accountNamePlaceholderKey(0) : namePlaceholderKey(0),
    );
  });

  it('names a key every dictionary answers, for every index in range', () => {
    for (let index = 0; index < count; index += 1) {
      const key = keyAt(index);

      for (const locale of locales) {
        expect(messages[locale][key]).toBeTruthy();
      }
    }
  });

  it('folds an index out of range instead of naming a key nobody wrote', () => {
    expect(keyAt(count)).toBe(keyAt(0));
    expect(keyAt(count * 3 + 2)).toBe(keyAt(2));
    expect(keyAt(-1)).toBe(keyAt(count - 1));
    expect(messages.ru[keyAt(1_000_000)]).toBeTruthy();
  });

  it('is reached in full by the pick, so an example added to it is not dead weight', () => {
    const seen = new Set(Array.from({ length: 400 }, () => keyAt(pickNamePlaceholderIndex())));

    expect(seen.size).toBe(count);
  });
});

describe('the placeholder pick', () => {
  it('answers a whole number no set has to be asked about first', () => {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const index = pickNamePlaceholderIndex();

      expect(Number.isInteger(index)).toBe(true);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(messages.ru[namePlaceholderKey(index)]).toBeTruthy();
      expect(messages.ru[accountNamePlaceholderKey(index)]).toBeTruthy();
    }
  });
});
