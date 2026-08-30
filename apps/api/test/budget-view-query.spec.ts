import { budgetViewStatement, type BudgetViewBounds } from '@/budget-view/budget-view.query';

const USER = 'user_2rondoQueryAaaaaaaaaaaaaaa';
const BUDGET = '0199c1a8-9ecf-71c7-a617-c575df07365d';
const OTHER_BUDGET = '0199c1a8-9ecf-71c7-a617-c575df073660';

const BOUNDS: BudgetViewBounds = {
  monthStart: '2026-02-01',
  nextMonthStart: '2026-03-01',
  hiddenFrom: new Date('2026-02-28T23:00:00Z'),
};

const TABLES = [
  'category_group',
  'category',
  'assignment',
  'transaction',
  'category_target',
] as const;

const TABLE_REFERENCE =
  /\b(?:from|join)\s+"?(category_group|category_target|category|assignment|transaction)"?\b/gi;

function scopeOfEachTable(text: string): { table: string; scoped: boolean }[] {
  const references = [...text.matchAll(TABLE_REFERENCE)];

  return references.map((reference, index) => {
    const next = references[index + 1];
    const clause = text.slice(reference.index, next ? next.index : text.length);

    return {
      table: reference[1] ?? '',
      scoped: /user_id"?\s*=\s*\$\d/i.test(clause) && /budget_id"?\s*=\s*\$\d/i.test(clause),
    };
  });
}

describe('the budget view statement', () => {
  it('carries the caller and the budget as bound parameters, never as text', () => {
    const statement = budgetViewStatement({ userId: USER }, BUDGET, BOUNDS);

    expect(statement.values).toContain(USER);
    expect(statement.values).toContain(BUDGET);
    expect(statement.text).not.toContain(USER);
    expect(statement.text).not.toContain(BUDGET);
  });

  it('changes only its values when the budget changes, so the scope cannot be baked in', () => {
    const first = budgetViewStatement({ userId: USER }, BUDGET, BOUNDS);
    const second = budgetViewStatement({ userId: USER }, OTHER_BUDGET, BOUNDS);

    expect(second.text).toBe(first.text);
    expect(second.values).not.toEqual(first.values);
    expect(second.values).toContain(OTHER_BUDGET);
    expect(second.values).not.toContain(BUDGET);
  });

  it('scopes every table it reads by both the caller and the budget, in that table clause', () => {
    const { text } = budgetViewStatement({ userId: USER }, BUDGET, BOUNDS);
    const read = scopeOfEachTable(text);

    expect([...new Set(read.map((entry) => entry.table))].sort()).toEqual([...TABLES].sort());
    expect(read.filter((entry) => !entry.scoped)).toEqual([]);
  });

  it('keeps both visibility filters when the caller has not asked for the hidden ones', () => {
    const { text } = budgetViewStatement({ userId: USER }, BUDGET, BOUNDS);

    expect([...text.matchAll(/hidden_at\s+is\s+null/gi)]).toHaveLength(2);
  });

  it('drops both visibility filters when the caller asks for the hidden ones, and nothing else', () => {
    const closed = budgetViewStatement({ userId: USER }, BUDGET, BOUNDS);
    const open = budgetViewStatement({ userId: USER }, BUDGET, BOUNDS, { includeHidden: true });

    expect(open.text).not.toMatch(/hidden_at\s+is\s+null/i);
    expect(open.text.replace(/\s+/g, ' ')).not.toBe(closed.text.replace(/\s+/g, ' '));
    expect(scopeOfEachTable(open.text).filter((entry) => !entry.scoped)).toEqual([]);
  });

  it('reports whether each row is hidden in the month it was asked about', () => {
    const { text } = budgetViewStatement({ userId: USER }, BUDGET, BOUNDS, { includeHidden: true });

    expect(text).toContain('"groupHidden"');
    expect(text).toContain('"categoryHidden"');
  });

  it('answers what a category holds over every month, which is what blocks a hide', () => {
    const { text } = budgetViewStatement({ userId: USER }, BUDGET, BOUNDS);

    expect(text).toContain('"availableAllTime"');
  });

  it('binds the month window as calendar dates and the visibility boundary as its own instant', () => {
    const { text, values } = budgetViewStatement({ userId: USER }, BUDGET, BOUNDS);

    expect(values).toContain('2026-02-01');
    expect(values).toContain('2026-03-01');
    expect(values).toContain(BOUNDS.hiddenFrom);
    expect(text).not.toContain('2026');
  });
});
