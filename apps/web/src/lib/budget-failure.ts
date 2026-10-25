import { isBudgetRefusal } from '@rondo/types';

export function isUnknownBudget(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  const statusCode = 'statusCode' in error ? error.statusCode : undefined;
  const reason = 'reason' in error ? error.reason : undefined;

  return statusCode === 400 && isBudgetRefusal(reason) && reason === 'UNKNOWN_BUDGET';
}

export function isNameTaken(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  const statusCode = 'statusCode' in error ? error.statusCode : undefined;
  const reason = 'reason' in error ? error.reason : undefined;

  return statusCode === 400 && isBudgetRefusal(reason) && reason === 'NAME_TAKEN';
}
