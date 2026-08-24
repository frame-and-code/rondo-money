/// The kinds of account v1 holds. A credit card changes how Ready to Assign is counted and is
/// deliberately not one of them.
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
