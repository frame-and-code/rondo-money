import { openAccountBalances } from '@/accounts/account-balances.query';
import { netWorthStatement } from '@/net-worth/net-worth.query';

const USER = 'user_2rondoNetWorthQueryAaaaaa';
const OTHER_USER = 'user_2rondoNetWorthQueryBbbbbb';
const BUDGET = '0199c1a8-9ecf-71c7-a617-c575df073920';
const OTHER_BUDGET = '0199c1a8-9ecf-71c7-a617-c575df073921';

const TABLES = ['account', 'asset', 'liability', 'transaction'] as const;

const TABLE_REFERENCE = /\b(?:from|join)\s+"?(account|transaction|asset|liability)"?\b/gi;

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

describe('the net worth statement', () => {
  it('carries the caller and the budget as bound parameters, never as text', () => {
    const statement = netWorthStatement({ userId: USER }, BUDGET);

    expect(statement.values).toContain(USER);
    expect(statement.values).toContain(BUDGET);
    expect(statement.text).not.toContain(USER);
    expect(statement.text).not.toContain(BUDGET);
  });

  it('changes only its values when the budget or the caller changes, so no scope is baked in', () => {
    const first = netWorthStatement({ userId: USER }, BUDGET);
    const second = netWorthStatement({ userId: OTHER_USER }, OTHER_BUDGET);

    expect(second.text).toBe(first.text);
    expect(second.values).toContain(OTHER_USER);
    expect(second.values).toContain(OTHER_BUDGET);
    expect(second.values).not.toContain(USER);
    expect(second.values).not.toContain(BUDGET);
  });

  it('scopes every table it reads by both the caller and the budget, in that table clause', () => {
    const { text } = netWorthStatement({ userId: USER }, BUDGET);
    const read = scopeOfEachTable(text);

    expect([...new Set(read.map((entry) => entry.table))].sort()).toEqual([...TABLES].sort());
    expect(read.filter((entry) => !entry.scoped)).toEqual([]);
  });

  it('sums an account balance with the very statement the accounts screen uses', () => {
    const shared = openAccountBalances({ userId: USER }, BUDGET);

    expect(shared.sql.trim()).not.toBe('');
    expect(netWorthStatement({ userId: USER }, BUDGET).sql).toContain(shared.sql);
  });
});
