import { budgetsLockStatement } from '@/budgets/budget-lock.query';

const USER = 'user_2rondoBudgetLockAaaaaaaa';
const OTHER_USER = 'user_2rondoBudgetLockBbbbbbbb';

describe('the statement that holds a caller’s budgets still', () => {
  it('carries the caller as a bound parameter, never as text', () => {
    const statement = budgetsLockStatement({ userId: USER });

    expect(statement.values).toEqual([USER]);
    expect(statement.text).not.toContain(USER);
  });

  it('changes only its values when the caller changes, so the scope cannot be baked in', () => {
    const first = budgetsLockStatement({ userId: USER });
    const second = budgetsLockStatement({ userId: OTHER_USER });

    expect(second.text).toBe(first.text);
    expect(second.values).toEqual([OTHER_USER]);
  });

  it('filters by the caller, so it can never hold a row of another tenant', () => {
    const { text } = budgetsLockStatement({ userId: USER });

    expect(text).toMatch(/user_id"?\s*=\s*\$\d/i);
  });

  it('takes the rows in one order, so two switches wait for each other instead of deadlocking', () => {
    const { text } = budgetsLockStatement({ userId: USER });

    expect(text).toMatch(/order by\s+\S*id\b/i);
  });

  it('takes the rows for update, because a plain read holds nothing back', () => {
    const { text } = budgetsLockStatement({ userId: USER });

    expect(text.toLowerCase()).toContain('for update');
  });
});
