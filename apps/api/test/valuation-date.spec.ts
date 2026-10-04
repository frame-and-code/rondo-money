import { refuseValuation } from '@/net-worth/valuation-date';
import { type BudgetClock } from '@/transactions/entry-rules';

const CLOCK: BudgetClock = { timezone: 'Europe/Warsaw', today: '2026-08-31' };

describe('the day a valuation may carry', () => {
  it('takes today in the budget timezone', () => {
    expect(refuseValuation('2026-08-31', CLOCK)).toBeNull();
  });

  it('takes a day long past, because a flat was worth something years ago too', () => {
    expect(refuseValuation('2019-02-28', CLOCK)).toBeNull();
  });

  it('refuses tomorrow, because nobody knows yet what a thing will be worth', () => {
    expect(refuseValuation('2026-09-01', CLOCK)).toBe('DATE_IN_FUTURE');
  });

  it('takes no day at all, which is an amount nobody dated', () => {
    expect(refuseValuation(null, CLOCK)).toBeNull();
  });
});
