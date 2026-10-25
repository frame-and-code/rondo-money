import { budgetNamedStatement } from '@/budgets/budget-name.query';

const USER = 'user_2rondoBudgetNameAaaaaaa';
const BUDGET = '0199c1a8-9ecf-71c7-a617-c575df07365d';

describe('the statement that looks for a budget of the caller under a name', () => {
  it('carries the caller, the name and the budget left out as bound parameters, never as text', () => {
    const statement = budgetNamedStatement({ userId: USER }, 'Дом', BUDGET);

    expect(statement.values).toEqual(expect.arrayContaining([USER, 'Дом', BUDGET]));
    expect(statement.text).not.toContain(USER);
    expect(statement.text).not.toContain('Дом');
  });

  it('filters by the caller and compares names the way the index does, without case', () => {
    const { text } = budgetNamedStatement({ userId: USER }, 'Дом', null);

    expect(text).toMatch(/user_id"?\s*=\s*\$\d/i);
    expect(text).toMatch(/lower\(\s*\S*name"?\s*\)\s*=\s*lower\(\s*\$\d/i);
  });
});
