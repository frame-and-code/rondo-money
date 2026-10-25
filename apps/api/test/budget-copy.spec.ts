import { copiedTree, goalsComeAlong, type TemplateTreeRow } from '@/budgets/budget-copy';

const MONTH = '2026-08';

const NO_GOAL = {
  targetId: null,
  targetKind: null,
  targetAmount: null,
  targetStartMonth: null,
  targetDueMonth: null,
  targetEndMonth: null,
} as const;

const row = (over: Partial<TemplateTreeRow> = {}): TemplateTreeRow => ({
  groupId: 'group-a',
  groupName: 'Дом',
  groupSortOrder: 0,
  categoryId: 'category-a',
  categoryName: 'Жильё',
  categorySortOrder: 0,
  icon: 'home',
  color: 'blue',
  ...NO_GOAL,
  ...over,
});

const goal = (over: Partial<TemplateTreeRow> = {}): Partial<TemplateTreeRow> => ({
  targetId: 'target-a',
  targetKind: 'CONTRIBUTE',
  targetAmount: 50_000n,
  targetStartMonth: '2026-05',
  targetDueMonth: null,
  targetEndMonth: null,
  ...over,
});

const copied = (rows: TemplateTreeRow[], withGoals = true) =>
  copiedTree(rows, { month: MONTH, withGoals });

const onlyGoalOf = (rows: TemplateTreeRow[], withGoals = true) =>
  copied(rows, withGoals)[0]?.categories[0]?.goal;

describe('the order a copy is written in', () => {
  it('numbers the groups from zero with no gaps, whatever gaps the template had', () => {
    const groups = copied([
      row({ groupId: 'g-first', groupName: 'Дом', groupSortOrder: 2, categoryId: 'c-1' }),
      row({ groupId: 'g-mid', groupName: 'Жизнь', groupSortOrder: 4, categoryId: 'c-2' }),
      row({ groupId: 'g-late', groupName: 'Цели', groupSortOrder: 7, categoryId: 'c-3' }),
    ]);

    expect(groups.map((group) => [group.name, group.sortOrder])).toEqual([
      ['Дом', 0],
      ['Жизнь', 1],
      ['Цели', 2],
    ]);
  });

  it('numbers the categories of each group from zero on their own', () => {
    const groups = copied([
      row({ categoryId: 'c-1', categoryName: 'Жильё', categorySortOrder: 3 }),
      row({ categoryId: 'c-2', categoryName: 'Свет', categorySortOrder: 5 }),
      row({
        groupId: 'group-b',
        groupName: 'Жизнь',
        groupSortOrder: 1,
        categoryId: 'c-3',
        categoryName: 'Еда',
        categorySortOrder: 9,
      }),
    ]);

    expect(
      groups.map((group) =>
        group.categories.map((category) => [category.name, category.sortOrder]),
      ),
    ).toEqual([
      [
        ['Жильё', 0],
        ['Свет', 1],
      ],
      [['Еда', 0]],
    ]);
  });

  it('keeps the order the rows arrive in, which the statement took from the screen, when stored orders tie', () => {
    const groups = copied([
      row({ categoryId: 'c-1', categoryName: 'яблоки', categorySortOrder: 1 }),
      row({ categoryId: 'c-2', categoryName: 'Яблоки', categorySortOrder: 1 }),
      row({ categoryId: 'c-3', categoryName: 'Арбуз', categorySortOrder: 1 }),
    ]);

    expect(groups[0]?.categories.map((category) => [category.name, category.sortOrder])).toEqual([
      ['яблоки', 0],
      ['Яблоки', 1],
      ['Арбуз', 2],
    ]);
  });

  it('keeps a group that has no category to show, as an empty group', () => {
    const groups = copied([
      row({
        categoryId: null,
        categoryName: null,
        categorySortOrder: null,
        icon: null,
        color: null,
      }),
    ]);

    expect(groups).toEqual([{ name: 'Дом', sortOrder: 0, categories: [] }]);
  });

  it('carries the name, the icon and the colour of a category, and nothing of its identity', () => {
    const [group] = copied([row({ icon: 'bolt', color: 'amber' })]);

    expect(group?.categories).toEqual([
      { name: 'Жильё', sortOrder: 0, icon: 'bolt', color: 'amber', goal: null },
    ]);
  });
});

describe('the goal a copied category starts with', () => {
  it('starts in the month of the copy, with the same kind, amount and due month, and no end', () => {
    const due = goal({ targetKind: 'BY_DATE', targetAmount: 300_000n, targetDueMonth: '2026-12' });

    expect(onlyGoalOf([row(due)])).toEqual({
      kind: 'BY_DATE',
      amount: 300_000n,
      startMonth: MONTH,
      dueMonth: '2026-12',
    });
  });

  it('is absent for a goal closed in the month of the copy, which that month still shows', () => {
    expect(onlyGoalOf([row(goal({ targetEndMonth: MONTH }))])).toBeNull();
  });

  it('is absent for a goal that was due before the month of the copy', () => {
    const overdue = goal({ targetKind: 'BY_DATE', targetDueMonth: '2026-07' });

    expect(onlyGoalOf([row(overdue)])).toBeNull();
  });

  it('is present for a goal due in the month of the copy itself', () => {
    const dueNow = goal({ targetKind: 'BY_DATE', targetDueMonth: MONTH });

    expect(onlyGoalOf([row(dueNow)])).toMatchObject({ kind: 'BY_DATE', dueMonth: MONTH });
  });

  it('is absent for a goal that only starts in a later month', () => {
    expect(onlyGoalOf([row(goal({ targetStartMonth: '2026-09' }))])).toBeNull();
  });

  it('is present for a goal that started in the month of the copy itself', () => {
    expect(onlyGoalOf([row(goal({ targetStartMonth: MONTH }))])).toMatchObject({
      startMonth: MONTH,
      amount: 50_000n,
    });
  });

  it('is the live one when the category also carries goals that ended', () => {
    const rows = [
      row(
        goal({
          targetId: 't-old',
          targetAmount: 10_000n,
          targetStartMonth: '2026-01',
          targetEndMonth: '2026-04',
        }),
      ),
      row(goal({ targetId: 't-live', targetAmount: 70_000n, targetStartMonth: '2026-05' })),
    ];

    const [group] = copied(rows);

    expect(group?.categories).toHaveLength(1);
    expect(group?.categories[0]?.goal).toMatchObject({ amount: 70_000n });
  });

  it('is absent everywhere when the copy is told goals do not come along', () => {
    const groups = copied(
      [row(goal()), row({ categoryId: 'c-2', ...goal({ targetId: 't-2' }) })],
      false,
    );

    expect(groups.flatMap((group) => group.categories.map((category) => category.goal))).toEqual([
      null,
      null,
    ]);
  });
});

describe('whether goals come along into the copy', () => {
  it('says yes when the currency and its digit count are both the same', () => {
    expect(
      goalsComeAlong({ currency: 'PLN', minorDigits: 2 }, { currency: 'PLN', minorDigits: 2 }),
    ).toBe(true);
  });

  it('says no when the currency differs, even at the same digit count', () => {
    expect(
      goalsComeAlong({ currency: 'PLN', minorDigits: 2 }, { currency: 'EUR', minorDigits: 2 }),
    ).toBe(false);
  });

  it('says no when the currency is the same and the digit count frozen on the template differs', () => {
    expect(
      goalsComeAlong({ currency: 'PLN', minorDigits: 3 }, { currency: 'PLN', minorDigits: 2 }),
    ).toBe(false);
  });
});
