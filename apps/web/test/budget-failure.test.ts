import { isNameTaken, isUnknownBudget } from '@/lib/budget-failure';

describe('whether a refused budget means the one it was started from is gone', () => {
  it('says so for the reason the domain gives', () => {
    expect(isUnknownBudget({ statusCode: 400, reason: 'UNKNOWN_BUDGET' })).toBe(true);
  });

  it('does not say so for another refusal of the same status', () => {
    expect(isUnknownBudget({ statusCode: 400, reason: 'NO_ACTIVE_BUDGET' })).toBe(false);
    expect(isUnknownBudget({ statusCode: 400 })).toBe(false);
  });

  it('does not say so for a conflict, a server failure or a request that never arrived', () => {
    expect(isUnknownBudget({ statusCode: 409 })).toBe(false);
    expect(isUnknownBudget({ statusCode: 500 })).toBe(false);
    expect(isUnknownBudget(new Error('unreachable'))).toBe(false);
    expect(isUnknownBudget(null)).toBe(false);
    expect(isUnknownBudget(undefined)).toBe(false);
  });
});

describe('whether a refused budget name is one the user already has', () => {
  it('says so for the reason the domain gives', () => {
    expect(isNameTaken({ statusCode: 400, reason: 'NAME_TAKEN' })).toBe(true);
  });

  it('does not say so for any other failure', () => {
    expect(isNameTaken({ statusCode: 400, reason: 'UNKNOWN_BUDGET' })).toBe(false);
    expect(isNameTaken({ statusCode: 409 })).toBe(false);
    expect(isNameTaken(new Error('unreachable'))).toBe(false);
    expect(isNameTaken(null)).toBe(false);
  });
});
