import { type TransactionDto } from './transaction.js';

export const TRANSFER_REFUSALS = [
  'ACCOUNT_ARCHIVED',
  'DATE_BEFORE_ACCOUNT',
  'DATE_IN_FUTURE',
  'NO_ACTIVE_BUDGET',
  'SAME_ACCOUNT',
  'UNKNOWN_ACCOUNT',
  'UNKNOWN_TRANSFER',
] as const;

export type TransferRefusal = (typeof TRANSFER_REFUSALS)[number];

export function isTransferRefusal(value: unknown): value is TransferRefusal {
  return typeof value === 'string' && (TRANSFER_REFUSALS as readonly string[]).includes(value);
}

export interface TransferDto {
  transferId: string;

  from: TransactionDto;

  to: TransactionDto;
}
