import { type Language } from '@rondo/db';
import { type CategoryColor, type CategoryIcon } from '@rondo/types';

export interface DefaultCategory {
  name: string;
  sortOrder: number;
  icon: CategoryIcon;
  color: CategoryColor;
}

const LOOK: ReadonlyArray<ReadonlyArray<readonly [CategoryIcon, CategoryColor]>> = [
  [
    ['home', 'blue'],
    ['bolt', 'amber'],
    ['wifi', 'cyan'],
  ],
  [
    ['cart', 'green'],
    ['car', 'orange'],
    ['coffee', 'rose'],
    ['dots', 'slate'],
  ],
  [
    ['music', 'violet'],
    ['heart', 'plum'],
    ['repeat', 'teal'],
  ],
  [['shield', 'blue']],
];

function lookOf(
  groupIndex: number,
  categoryIndex: number,
): { icon: CategoryIcon; color: CategoryColor } {
  const found = LOOK[groupIndex]?.[categoryIndex];
  if (!found) {
    throw new Error(
      `The starter set has no look for category ${categoryIndex} of group ${groupIndex}: the ` +
        'names and the look are two lists that have to stay the same shape',
    );
  }

  return { icon: found[0], color: found[1] };
}

export interface DefaultCategoryGroup {
  name: string;
  sortOrder: number;
  categories: readonly DefaultCategory[];
}

const SET_BY_LANGUAGE: Record<Language, ReadonlyArray<readonly [string, readonly string[]]>> = {
  RU: [
    ['Обязательные платежи', ['Жильё', 'Коммунальные услуги', 'Связь и интернет']],
    ['Повседневные расходы', ['Продукты', 'Транспорт', 'Кафе и рестораны', 'Прочее']],
    ['Качество жизни', ['Развлечения', 'Здоровье', 'Подписки']],
    ['Финансовые цели', ['Подушка безопасности']],
  ],
  EN: [
    ['Bills', ['Housing', 'Utilities', 'Phone and internet']],
    ['Everyday spending', ['Groceries', 'Transport', 'Eating out', 'Other']],
    ['Quality of life', ['Fun', 'Health', 'Subscriptions']],
    ['Financial goals', ['Emergency fund']],
  ],
  PL: [
    ['Opłaty stałe', ['Mieszkanie', 'Media', 'Telefon i internet']],
    ['Codzienne wydatki', ['Zakupy spożywcze', 'Transport', 'Jedzenie na mieście', 'Inne']],
    ['Jakość życia', ['Rozrywka', 'Zdrowie', 'Subskrypcje']],
    ['Cele finansowe', ['Fundusz awaryjny']],
  ],
};

export function defaultCategories(language: Language): readonly DefaultCategoryGroup[] {
  return SET_BY_LANGUAGE[language].map(([name, categories], groupIndex) => ({
    name,
    sortOrder: groupIndex,
    categories: categories.map((categoryName, categoryIndex) => ({
      name: categoryName,
      sortOrder: categoryIndex,
      ...lookOf(groupIndex, categoryIndex),
    })),
  }));
}
