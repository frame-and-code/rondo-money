import { type Prisma } from '@rondo/db';

import {
  assetsStatement,
  categoryTreeStatement,
  liabilitiesStatement,
  openAccountsStatement,
} from '@/budgets/budget-structure.query';
import { type RawQueryScope } from '@/raw-sql/scoped-raw.repository';

const USER = 'user_2rondoStructureAaaaaaaa';
const OTHER_USER = 'user_2rondoStructureBbbbbbbb';
const BUDGET = '0199c1a8-9ecf-71c7-a617-c575df07365d';
const OTHER_BUDGET = '0199c1a8-9ecf-71c7-a617-c575df073660';

type Build = (scope: RawQueryScope, budgetId: string) => Prisma.Sql;

const STATEMENTS: { name: string; build: Build; tables: string[] }[] = [
  {
    name: 'the category tree',
    build: categoryTreeStatement,
    tables: ['category', 'category_group', 'category_target'],
  },
  { name: 'the open accounts', build: openAccountsStatement, tables: ['account'] },
  { name: 'the assets', build: assetsStatement, tables: ['asset'] },
  { name: 'the liabilities', build: liabilitiesStatement, tables: ['liability'] },
];

const TABLE_REFERENCE =
  /\b(?:from|join)\s+"?(category_group|category_target|category|account|asset|liability)"?\b/gi;

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

describe.each(STATEMENTS)('the statement that reads $name of a budget', ({ build, tables }) => {
  it('reads exactly the tables it is meant to, each scoped by the caller and the budget in its own clause', () => {
    const read = scopeOfEachTable(build({ userId: USER }, BUDGET).text);

    expect([...new Set(read.map((entry) => entry.table))].sort()).toEqual([...tables].sort());
    expect(read.filter((entry) => !entry.scoped)).toEqual([]);
  });

  it('carries the caller and the budget as bound parameters, never as text', () => {
    const statement = build({ userId: USER }, BUDGET);

    expect(statement.values).toContain(USER);
    expect(statement.values).toContain(BUDGET);
    expect(statement.text).not.toContain(USER);
    expect(statement.text).not.toContain(BUDGET);
  });

  it('changes only its values when the caller and the budget change, so neither can be baked in', () => {
    const first = build({ userId: USER }, BUDGET);
    const second = build({ userId: OTHER_USER }, OTHER_BUDGET);

    expect(second.text).toBe(first.text);
    expect(second.values).toContain(OTHER_USER);
    expect(second.values).toContain(OTHER_BUDGET);
    expect(second.values).not.toContain(USER);
    expect(second.values).not.toContain(BUDGET);
  });
});

describe('what a copy leaves behind', () => {
  it('filters the category tree by visibility twice, once for the category and once for its group', () => {
    const { text } = categoryTreeStatement({ userId: USER }, BUDGET);

    expect([...text.matchAll(/hidden_at\s+is\s+null/gi)]).toHaveLength(2);
  });

  it('filters the accounts down to the ones that are not archived', () => {
    const { text } = openAccountsStatement({ userId: USER }, BUDGET);

    expect([...text.matchAll(/archived_at\s+is\s+null/gi)]).toHaveLength(1);
  });
});
