import { accountBalancesStatement } from '@/accounts/account-balances.query';

const USER = 'user_2rondoBalanceQueryAaaaaaa';
const BUDGET = '0199c1a8-9ecf-71c7-a617-c575df073900';
const OTHER_BUDGET = '0199c1a8-9ecf-71c7-a617-c575df073901';

const TABLES = ['account', 'transaction'] as const;

const TABLE_REFERENCE = /\b(?:from|join)\s+"?(account|transaction)"?\b/gi;

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

describe('the account balances statement', () => {
  it('carries the caller and the budget as bound parameters, never as text', () => {
    const statement = accountBalancesStatement({ userId: USER }, BUDGET);

    expect(statement.values).toContain(USER);
    expect(statement.values).toContain(BUDGET);
    expect(statement.text).not.toContain(USER);
    expect(statement.text).not.toContain(BUDGET);
  });

  it('changes only its values when the budget changes, so the scope cannot be baked in', () => {
    const first = accountBalancesStatement({ userId: USER }, BUDGET);
    const second = accountBalancesStatement({ userId: USER }, OTHER_BUDGET);

    expect(second.text).toBe(first.text);
    expect(second.values).not.toEqual(first.values);
    expect(second.values).toContain(OTHER_BUDGET);
    expect(second.values).not.toContain(BUDGET);
  });

  it('scopes every table it reads by both the caller and the budget, in that table clause', () => {
    const { text } = accountBalancesStatement({ userId: USER }, BUDGET);
    const read = scopeOfEachTable(text);

    expect([...new Set(read.map((entry) => entry.table))].sort()).toEqual([...TABLES].sort());
    expect(read.filter((entry) => !entry.scoped)).toEqual([]);
  });
});

describe('what the statement says about correcting an opening balance', () => {
  it('counts what a person wrote, leaves out what the app wrote, and bounds no month', () => {
    const text = accountBalancesStatement({ userId: USER }, BUDGET).text.toLowerCase();

    expect(text).toMatch(/count\([^)]*\)\s*filter\s*\(\s*where\s+not\s+t\.is_system/);
    expect(text).not.toMatch(/\bdate\b/);
  });
});
