export const ACCOUNT_TYPES = ['CASH', 'DEBIT'] as const;

export type AccountType = (typeof ACCOUNT_TYPES)[number];

export function isAccountType(value: unknown): value is AccountType {
  return typeof value === 'string' && (ACCOUNT_TYPES as readonly string[]).includes(value);
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
}

export interface AccountsDto {
  accounts: AccountBalanceDto[];

  total: string;
}
