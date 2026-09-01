import { accountLockStatement } from '@/accounts/account-lock.query';

const USER = 'user_2rondoAccountLockAaaaaaaa';
const BUDGET = '0199c1a8-9ecf-71c7-a617-c575df073910';
const OTHER_BUDGET = '0199c1a8-9ecf-71c7-a617-c575df073911';
const ACCOUNT = '0199c1a8-9ecf-71c7-a617-c575df073912';

describe('the statement that holds an account still', () => {
  it('carries the caller, the budget and the account as bound parameters, never as text', () => {
    const statement = accountLockStatement({ userId: USER }, BUDGET, ACCOUNT);

    expect(statement.values).toEqual(expect.arrayContaining([USER, BUDGET, ACCOUNT]));
    expect(statement.text).not.toContain(USER);
    expect(statement.text).not.toContain(BUDGET);
    expect(statement.text).not.toContain(ACCOUNT);
  });

  it('changes only its values when the budget changes, so the scope cannot be baked in', () => {
    const first = accountLockStatement({ userId: USER }, BUDGET, ACCOUNT);
    const second = accountLockStatement({ userId: USER }, OTHER_BUDGET, ACCOUNT);

    expect(second.text).toBe(first.text);
    expect(second.values).toContain(OTHER_BUDGET);
    expect(second.values).not.toContain(BUDGET);
  });

  it('filters by the caller and the budget, so it can never hold a row of another tenant', () => {
    const { text } = accountLockStatement({ userId: USER }, BUDGET, ACCOUNT);

    expect(text).toMatch(/user_id"?\s*=\s*\$\d/i);
    expect(text).toMatch(/budget_id"?\s*=\s*\$\d/i);
  });

  it('takes the row for update, because a plain read holds nothing back', () => {
    const { text } = accountLockStatement({ userId: USER }, BUDGET, ACCOUNT);

    expect(text.toLowerCase()).toContain('for update');
  });
});
