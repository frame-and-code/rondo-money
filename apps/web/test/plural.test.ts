import { locales } from '@/i18n/locales';
import { plurals } from '@/i18n/messages';
import { pluralCategories, translatePlural } from '@/i18n/plural';

const counted = (locale: (typeof locales)[number], total: number): string =>
  translatePlural(locale, 'newBudget.currencyCount', total, { shown: total, total });

describe('a count that bends the word after it', () => {
  it.each([
    [1, '1 из 1 валюты'],
    [2, '2 из 2 валют'],
    [5, '5 из 5 валют'],
    [11, '11 из 11 валют'],
    [12, '12 из 12 валют'],
    [21, '21 из 21 валюты'],
    [22, '22 из 22 валют'],
    [111, '111 из 111 валют'],
  ])('reads %i in Russian as "%s"', (total, expected) => {
    expect(counted('ru', total)).toBe(expected);
  });

  it.each([
    [1, '1 z 1 waluty'],
    [2, '2 z 2 walut'],
    [5, '5 z 5 walut'],
    [12, '12 z 12 walut'],
    [21, '21 z 21 walut'],
    [22, '22 z 22 walut'],
  ])('reads %i in Polish as "%s", which does not follow the Russian ending', (total, expected) => {
    expect(counted('pl', total)).toBe(expected);
  });

  it.each([
    [1, '1 of 1 currency'],
    [2, '2 of 2 currencies'],
    [21, '21 of 21 currencies'],
  ])('reads %i in English as "%s"', (total, expected) => {
    expect(counted('en', total)).toBe(expected);
  });

  it('picks the form by the count it is given, not by the numbers in the sentence', () => {
    expect(translatePlural('ru', 'newBudget.currencyCount', 21, { shown: 3, total: 21 })).toBe(
      '3 из 21 валюты',
    );
  });
});

describe('the plural dictionaries', () => {
  it.each(locales)('asks %s for exactly the forms its own plural rules choose from', (locale) => {
    const fromRules = new Intl.PluralRules(locale).resolvedOptions().pluralCategories;

    expect([...pluralCategories[locale]].sort()).toEqual([...fromRules].sort());
  });

  it.each(locales)('carries every one of those forms for every counted phrase in %s', (locale) => {
    const expected = [...pluralCategories[locale]].sort();

    for (const forms of Object.values(plurals[locale])) {
      expect(Object.keys(forms).sort()).toEqual(expected);
      for (const form of Object.values(forms)) {
        expect(form.trim()).not.toBe('');
      }
    }
  });

  it('counts the same phrases in every language', () => {
    const expected = Object.keys(plurals.ru).sort();

    for (const locale of locales) {
      expect(Object.keys(plurals[locale]).sort()).toEqual(expected);
    }
  });
});
