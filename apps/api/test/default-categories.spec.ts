import { type Language } from '@rondo/db';

import { defaultCategories } from '@/budgets/default-categories';

const LANGUAGES: readonly Language[] = ['RU', 'EN', 'PL'];

/// PRD 6.1.1 in Russian, which is the source of truth the set was decided in. The other two
/// languages are written natively rather than translated, so they are checked by structure and
/// by the two names the PRD pins by hand.
const RUSSIAN: ReadonlyArray<readonly [string, readonly string[]]> = [
  ['Обязательные платежи', ['Жильё', 'Коммунальные услуги', 'Связь и интернет']],
  ['Повседневные расходы', ['Продукты', 'Транспорт', 'Кафе и рестораны', 'Прочее']],
  ['Качество жизни', ['Развлечения', 'Здоровье', 'Подписки']],
  ['Финансовые цели', ['Подушка безопасности']],
];

const namesOf = (language: Language): string[] =>
  defaultCategories(language).flatMap((group) => [
    group.name,
    ...group.categories.map((category) => category.name),
  ]);

describe('the default category set', () => {
  it('is the set PRD 6.1.1 decided, in the language it was decided in', () => {
    const groups = defaultCategories('RU');

    expect(groups.map((group) => [group.name, group.categories.map((c) => c.name)])).toEqual(
      RUSSIAN.map(([name, categories]) => [name, [...categories]]),
    );
  });

  it.each(LANGUAGES)('carries four groups and eleven categories in %s', (language) => {
    const groups = defaultCategories(language);

    expect(groups).toHaveLength(4);
    expect(groups.flatMap((group) => group.categories)).toHaveLength(11);
    expect(groups.map((group) => group.categories.length)).toEqual([3, 4, 3, 1]);
  });

  it.each(LANGUAGES)(
    'orders the groups and each group’s categories without gaps in %s',
    (language) => {
      const groups = defaultCategories(language);

      expect(groups.map((group) => group.sortOrder)).toEqual([0, 1, 2, 3]);
      for (const group of groups) {
        expect(group.categories.map((category) => category.sortOrder)).toEqual(
          group.categories.map((_, index) => index),
        );
      }
    },
  );

  it.each(LANGUAGES)('names every group and category in %s', (language) => {
    for (const name of namesOf(language)) {
      expect(name.trim()).not.toBe('');
    }
  });

  it('is written in each language rather than translated once and reused', () => {
    const [russian, english, polish] = LANGUAGES.map(namesOf);

    expect(russian).not.toEqual(english);
    expect(english).not.toEqual(polish);
    expect(russian).not.toEqual(polish);

    russian?.forEach((name, index) => {
      expect(name).not.toBe(english?.[index]);
      expect(name).not.toBe(polish?.[index]);
    });
  });

  it('keeps the two Polish names the PRD writes out, which a translation would get wrong', () => {
    const polish = namesOf('PL');

    expect(polish).toContain('Media');
    expect(polish).toContain('Fundusz awaryjny');
  });
});
