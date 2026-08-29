import { categoryFailure } from '@/lib/category-failure';

describe('what a refused change to a category tells the user', () => {
  it('names the reason the domain gave rather than the status it came under', () => {
    expect(categoryFailure({ statusCode: 400, reason: 'AVAILABLE_NOT_ZERO' })).toBe(
      'categories.hideBlocked',
    );
    expect(categoryFailure({ statusCode: 400, reason: 'GROUP_HIDDEN' })).toBe(
      'categories.failGroupHidden',
    );
    expect(categoryFailure({ statusCode: 400, reason: 'ALREADY_HIDDEN' })).toBe(
      'categories.failAlreadyHidden',
    );
  });

  it('falls back on what the answer was when the domain gave no reason', () => {
    expect(categoryFailure({ statusCode: 409 })).toBe('categories.failConflict');
    expect(categoryFailure({ statusCode: 500 })).toBe('categories.failOther');
    expect(categoryFailure(new Error('unreachable'))).toBe('categories.failNetwork');
  });

  it('says the budget changed under the screen, whichever half reported it', () => {
    expect(categoryFailure({ statusCode: 400, reason: 'NO_ACTIVE_BUDGET' })).toBe(
      'categories.failBudget',
    );
  });
});
