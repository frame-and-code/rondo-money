import { type CalendarDate } from './calendar.js';

export const TRANSACTION_TYPES = ['INCOME', 'EXPENSE', 'TRANSFER', 'ADJUSTMENT'] as const;

export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export function isTransactionType(value: unknown): value is TransactionType {
  return typeof value === 'string' && (TRANSACTION_TYPES as readonly string[]).includes(value);
}

export const TRANSACTION_ENTRY_TYPES = ['INCOME', 'EXPENSE'] as const;

export type TransactionEntryType = (typeof TRANSACTION_ENTRY_TYPES)[number];

export function isTransactionEntryType(value: unknown): value is TransactionEntryType {
  return (
    typeof value === 'string' && (TRANSACTION_ENTRY_TYPES as readonly string[]).includes(value)
  );
}

export const TRANSACTION_REFUSALS = [
  'ACCOUNT_ARCHIVED',
  'CATEGORY_HIDDEN',
  'CATEGORY_REQUIRED',
  'DATE_BEFORE_ACCOUNT',
  'DATE_IN_FUTURE',
  'NOT_EDITABLE',
  'NO_ACTIVE_BUDGET',
  'UNKNOWN_ACCOUNT',
  'UNKNOWN_CATEGORY',
  'UNKNOWN_TRANSACTION',
] as const;

export type TransactionRefusal = (typeof TRANSACTION_REFUSALS)[number];

export function isTransactionRefusal(value: unknown): value is TransactionRefusal {
  return typeof value === 'string' && (TRANSACTION_REFUSALS as readonly string[]).includes(value);
}

export interface TransactionDto {
  id: string;

  accountId: string;

  categoryId: string | null;

  date: CalendarDate;

  amount: string;

  type: TransactionType;

  payee: string | null;

  isSystem: boolean;

  transferId: string | null;

  counterAccountId: string | null;

  createdAt: string;
}

export interface TransactionDayDto {
  date: CalendarDate;

  total: string;
}

export interface TransactionPageDto {
  transactions: TransactionDto[];

  days: TransactionDayDto[];

  nextCursor: string | null;
}

export interface PayeesDto {
  payees: string[];
}
