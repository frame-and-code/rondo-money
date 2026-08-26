import { type Language } from '@rondo/db';

export interface DefaultCategory {
  name: string;
  sortOrder: number;
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
    })),
  }));
}
