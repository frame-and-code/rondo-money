import { BUDGET_REFUSALS } from '@rondo/types';

describe('why a budget operation is refused', () => {
  it('holds the one reason a rename or an activation can answer with', () => {
    expect([...BUDGET_REFUSALS]).toEqual(['UNKNOWN_BUDGET']);
  });
});
