export const ACCOUNT_TYPES = ['CASH', 'DEBIT'] as const;

export type AccountType = (typeof ACCOUNT_TYPES)[number];

export function isAccountType(value: unknown): value is AccountType {
  return typeof value === 'string' && (ACCOUNT_TYPES as readonly string[]).includes(value);
}

export const ACCOUNT_REFUSALS = [
  'ACCOUNT_ARCHIVED',
  'BALANCE_NOT_ZERO',
  'NO_ACTIVE_BUDGET',
  'OPENING_FROZEN',
  'UNKNOWN_ACCOUNT',
] as const;

export type AccountRefusal = (typeof ACCOUNT_REFUSALS)[number];

export function isAccountRefusal(value: unknown): value is AccountRefusal {
  return typeof value === 'string' && (ACCOUNT_REFUSALS as readonly string[]).includes(value);
}

export interface AccountDto {
  id: string;

  name: string;

  type: AccountType;
}

export interface AccountBalanceDto {
  id: string;

  name: string;

  type: AccountType;

  balance: string;

  openingEditable: boolean;
}

export interface AccountsDto {
  accounts: AccountBalanceDto[];

  total: string;
}
