import { BUDGET_REFUSALS, isBudgetRefusal } from '@rondo/types';

describe('why a budget operation is refused', () => {
  it('holds the reasons a budget operation can answer with', () => {
    expect([...BUDGET_REFUSALS]).toEqual([
      'UNKNOWN_BUDGET',
      'TEMPLATE_WITH_DEFAULTS',
      'NAME_TAKEN',
    ]);
  });

  it('recognises every reason it holds, and nothing else', () => {
    for (const reason of BUDGET_REFUSALS) {
      expect(isBudgetRefusal(reason)).toBe(true);
    }

    expect(isBudgetRefusal('UNKNOWN_ACCOUNT')).toBe(false);
    expect(isBudgetRefusal('unknown_budget')).toBe(false);
    expect(isBudgetRefusal(undefined)).toBe(false);
    expect(isBudgetRefusal(400)).toBe(false);
  });
});
