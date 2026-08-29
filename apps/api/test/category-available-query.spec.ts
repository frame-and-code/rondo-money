import {
  categoryAvailableStatement,
  categoryLockStatement,
} from '@/categories/category-available.query';

const USER = 'user_2rondoAvailableAaaaaaaaaaa';
const BUDGET = '0199c1a8-9ecf-71c7-a617-c575df073700';
const OTHER_BUDGET = '0199c1a8-9ecf-71c7-a617-c575df073701';
const CATEGORIES = ['0199c1a8-9ecf-71c7-a617-c575df073710', '0199c1a8-9ecf-71c7-a617-c575df073711'];

const TABLE_REFERENCE = /\b(?:from|join)\s+"?(category|assignment|transaction)"?\b/gi;

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

describe('the statement that locks a category before it is hidden', () => {
  it('takes the rows for update, so a concurrent move waits instead of racing', () => {
    const { text } = categoryLockStatement({ userId: USER }, BUDGET, CATEGORIES);

    expect(text.toLowerCase()).toContain('for update');
  });

  it('carries the caller, the budget and the categories as bound parameters, never as text', () => {
    const statement = categoryLockStatement({ userId: USER }, BUDGET, CATEGORIES);

    expect(statement.values).toContain(USER);
    expect(statement.values).toContain(BUDGET);
    expect(statement.text).not.toContain(USER);
    expect(statement.text).not.toContain(BUDGET);
  });

  it('scopes the row it locks by both the caller and the budget', () => {
    const { text } = categoryLockStatement({ userId: USER }, BUDGET, CATEGORIES);

    expect(scopeOfEachTable(text).filter((entry) => !entry.scoped)).toEqual([]);
  });
});

describe('the statement that sums what a category holds over every month', () => {
  it('carries the caller and the budget as bound parameters, never as text', () => {
    const statement = categoryAvailableStatement({ userId: USER }, BUDGET, CATEGORIES);

    expect(statement.values).toContain(USER);
    expect(statement.values).toContain(BUDGET);
    expect(statement.text).not.toContain(USER);
    expect(statement.text).not.toContain(BUDGET);
  });

  it('changes only its values when the budget changes, so the scope cannot be baked in', () => {
    const first = categoryAvailableStatement({ userId: USER }, BUDGET, CATEGORIES);
    const second = categoryAvailableStatement({ userId: USER }, OTHER_BUDGET, CATEGORIES);

    expect(second.text).toBe(first.text);
    expect(second.values).toContain(OTHER_BUDGET);
    expect(second.values).not.toContain(BUDGET);
  });

  it('scopes every table it reads by both the caller and the budget, in that table clause', () => {
    const { text } = categoryAvailableStatement({ userId: USER }, BUDGET, CATEGORIES);
    const read = scopeOfEachTable(text);

    expect(read.map((entry) => entry.table).sort()).toEqual(['assignment', 'transaction']);
    expect(read.filter((entry) => !entry.scoped)).toEqual([]);
  });

  it('bounds no month, because the money that blocks a hide can sit in any of them', () => {
    const { text } = categoryAvailableStatement({ userId: USER }, BUDGET, CATEGORIES);

    expect(text).not.toMatch(/\bmonth\b\s*(<=|>=|<|>|=)/i);
    expect(text).not.toMatch(/\bdate\b\s*(<=|>=|<|>)/i);
  });

  it('answers in minor units, so the driver hands back an integer rather than a numeric', () => {
    const { text } = categoryAvailableStatement({ userId: USER }, BUDGET, CATEGORIES);

    expect(text).toContain('::bigint');
  });
});
