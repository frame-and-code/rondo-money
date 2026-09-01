import { accountBalanceStatement } from '@/accounts/account-balance.query';
import { accountLockStatement, openAccountsStatement } from '@/accounts/account-lock.query';

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

  it('brings back the fields the rule judges the row by, so a lost column reads as open', () => {
    const { text } = accountLockStatement({ userId: USER }, BUDGET, ACCOUNT);

    expect(text).toContain('archived_at');
    expect(text).toContain('created_at');
  });

  it('takes the row for update, because a plain read holds nothing back', () => {
    const { text } = accountLockStatement({ userId: USER }, BUDGET, ACCOUNT);

    expect(text.toLowerCase()).toContain('for update');
  });
});

const OTHER_ACCOUNT = '0199c1a8-9ecf-71c7-a617-c575df073913';

describe('the statement that holds the accounts a write names', () => {
  it('carries the caller, the budget and every account as bound parameters, never as text', () => {
    const statement = openAccountsStatement({ userId: USER }, BUDGET, [ACCOUNT, OTHER_ACCOUNT]);

    expect(statement.values.flat()).toEqual(
      expect.arrayContaining([USER, BUDGET, ACCOUNT, OTHER_ACCOUNT]),
    );
    expect(statement.text).not.toContain(USER);
    expect(statement.text).not.toContain(ACCOUNT);
  });

  it('filters by the caller and the budget, so it can never hold a row of another tenant', () => {
    const { text } = openAccountsStatement({ userId: USER }, BUDGET, [ACCOUNT]);

    expect(text).toMatch(/user_id"?\s*=\s*\$\d/i);
    expect(text).toMatch(/budget_id"?\s*=\s*\$\d/i);
  });

  it('orders by id, because two requests taking the same rows the other way round deadlock', () => {
    const { text } = openAccountsStatement({ userId: USER }, BUDGET, [ACCOUNT, OTHER_ACCOUNT]);

    expect(text.toLowerCase()).toMatch(/order\s+by\s+a?\.?"?id"?/);
  });

  it('takes the rows for share, which blocks an archive without blocking another write', () => {
    const held = openAccountsStatement({ userId: USER }, BUDGET, [ACCOUNT]);
    const archiving = accountLockStatement({ userId: USER }, BUDGET, ACCOUNT);

    expect(held.text.toLowerCase()).toContain('for share');
    expect(held.text.toLowerCase()).not.toContain('for update');
    expect(archiving.text.toLowerCase()).toContain('for update');
  });

  it('brings back what the entry rules judge a write by, so no path reads the row twice', () => {
    const { text } = openAccountsStatement({ userId: USER }, BUDGET, [ACCOUNT]);

    expect(text).toContain('archived_at');
    expect(text).toContain('created_at');
  });
});

describe('the statement that sums what one account holds', () => {
  it('carries the caller, the budget and the account as bound parameters, never as text', () => {
    const statement = accountBalanceStatement({ userId: USER }, BUDGET, ACCOUNT);

    expect(statement.values).toEqual(expect.arrayContaining([USER, BUDGET, ACCOUNT]));
    expect(statement.text).not.toContain(USER);
    expect(statement.text).not.toContain(ACCOUNT);
  });

  it('filters by the caller and the budget, so it can never sum a row of another tenant', () => {
    const { text } = accountBalanceStatement({ userId: USER }, BUDGET, ACCOUNT);

    expect(text).toMatch(/user_id"?\s*=\s*\$\d/i);
    expect(text).toMatch(/budget_id"?\s*=\s*\$\d/i);
  });

  it('bounds no day and no month, because money in a later one is money all the same', () => {
    const { text } = accountBalanceStatement({ userId: USER }, BUDGET, ACCOUNT);

    expect(text.toLowerCase()).not.toContain('date');
    expect(text.toLowerCase()).not.toContain('month');
  });

  it('counts the opening balance too, so an account opened with money is not archived as empty', () => {
    const { text } = accountBalanceStatement({ userId: USER }, BUDGET, ACCOUNT);

    expect(text).not.toContain('is_system');
  });
});
