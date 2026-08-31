import { parseMoney } from '@rondo/types';

import {
  refuseDraft,
  refuseRemoval,
  refuseSystemEdit,
  refuseTarget,
  signedAmount,
  type BudgetClock,
  type EntryDraft,
} from '@/transactions/entry-rules';

const ZONE = 'Europe/Warsaw';

const CLOCK: BudgetClock = { timezone: ZONE, today: '2026-08-31' };

const OPENED_AT = new Date('2026-06-01T09:00:00Z');

const draft = (over: Partial<EntryDraft> = {}): EntryDraft => ({
  type: 'EXPENSE',
  date: '2026-08-31',
  account: { createdAt: OPENED_AT, archivedAt: null },
  category: { hiddenAt: null },
  categoryChanged: true,
  ...over,
});

describe('the sign a transaction is stored with', () => {
  it('turns the amount a form sends into a debit for an expense', () => {
    expect(signedAmount('EXPENSE', parseMoney('120050'))).toBe(-120050n);
  });

  it('leaves income as it came', () => {
    expect(signedAmount('INCOME', parseMoney('120050'))).toBe(120050n);
  });
});

describe('the day a transaction may carry', () => {
  it('takes today in the budget timezone', () => {
    expect(refuseDraft(draft({ date: '2026-08-31' }), CLOCK)).toBeNull();
  });

  it('refuses tomorrow, because money is recorded after it moves', () => {
    expect(refuseDraft(draft({ date: '2026-09-01' }), CLOCK)).toBe('DATE_IN_FUTURE');
  });

  it('takes the day the account was opened', () => {
    expect(refuseDraft(draft({ date: '2026-06-01' }), CLOCK)).toBeNull();
  });

  it('refuses the day before the account existed', () => {
    expect(refuseDraft(draft({ date: '2026-05-31' }), CLOCK)).toBe('DATE_BEFORE_ACCOUNT');
  });

  it('reads the opening day in the budget timezone rather than from the stored instant', () => {
    const account = { createdAt: new Date('2026-06-01T22:30:00Z'), archivedAt: null };

    expect(refuseDraft(draft({ account, date: '2026-06-02' }), CLOCK)).toBeNull();
    expect(refuseDraft(draft({ account, date: '2026-06-01' }), CLOCK)).toBe('DATE_BEFORE_ACCOUNT');
  });
});

describe('the category a transaction needs', () => {
  it('refuses an expense that names none, because the money left an envelope', () => {
    expect(refuseDraft(draft({ category: null }), CLOCK)).toBe('CATEGORY_REQUIRED');
  });

  it('takes income that names none, which lands in ready to assign', () => {
    expect(refuseDraft(draft({ type: 'INCOME', category: null }), CLOCK)).toBeNull();
  });

  it('refuses a hidden category the draft is putting the money into', () => {
    const category = { hiddenAt: new Date('2026-07-01T00:00:00Z') };

    expect(refuseDraft(draft({ category, categoryChanged: true }), CLOCK)).toBe('CATEGORY_HIDDEN');
  });

  it('lets an old record keep a category that was hidden after it was written', () => {
    const category = { hiddenAt: new Date('2026-07-01T00:00:00Z') };

    expect(refuseDraft(draft({ category, categoryChanged: false }), CLOCK)).toBeNull();
  });
});

describe('the account a transaction lands on', () => {
  it('refuses an archived one, which takes no new records', () => {
    const account = { createdAt: OPENED_AT, archivedAt: new Date('2026-08-01T00:00:00Z') };

    expect(refuseDraft(draft({ account }), CLOCK)).toBe('ACCOUNT_ARCHIVED');
  });
});

describe('the records a person may change', () => {
  it('leaves an ordinary record alone', () => {
    expect(refuseTarget({ isSystem: false, transferId: null })).toBeNull();
  });

  it('lets the opening balance be changed, because an account is opened with a guess', () => {
    expect(refuseTarget({ isSystem: true, transferId: null })).toBeNull();
  });

  it('refuses to remove the opening balance, which belongs to the account', () => {
    expect(refuseRemoval({ isSystem: true, transferId: null })).toBe('NOT_EDITABLE');
    expect(refuseRemoval({ isSystem: false, transferId: null })).toBeNull();
  });

  it('refuses one leg of a transfer, which is edited as a pair or not at all', () => {
    expect(
      refuseTarget({ isSystem: false, transferId: 'b7f0c0de-0000-7000-8000-000000000000' }),
    ).toBe('NOT_EDITABLE');
  });
});

describe('what may change on an opening balance', () => {
  const held = {
    accountId: 'a1',
    categoryId: null,
    date: '2026-06-01',
    payee: null,
  };

  it('takes a correction of the amount, which is the number a person guessed', () => {
    expect(refuseSystemEdit(held, { ...held })).toBeNull();
  });

  it('refuses to move it to another account, which would leave the first one without one', () => {
    expect(refuseSystemEdit(held, { ...held, accountId: 'a2' })).toBe('NOT_EDITABLE');
  });

  it('refuses to date it elsewhere, because it is the day the account was opened', () => {
    expect(refuseSystemEdit(held, { ...held, date: '2026-06-02' })).toBe('NOT_EDITABLE');
  });

  it('refuses to put it in an envelope, because the money arrived ready to assign', () => {
    expect(refuseSystemEdit(held, { ...held, categoryId: 'c1' })).toBe('NOT_EDITABLE');
  });

  it('refuses to name a payee on it, because the app wrote it rather than a shop', () => {
    expect(refuseSystemEdit(held, { ...held, payee: 'Corner cafe' })).toBe('NOT_EDITABLE');
  });
});
