import { type Prisma, type Transaction } from '@rondo/db';
import { calendarDateOf, isTransactionType, parseCalendarDate, serializeMoney } from '@rondo/types';

import { type TransactionResponse } from '@/transactions/transaction.response';

export function serializeTransaction(
  row: Transaction,
  counterAccountId: string | null,
): Prisma.JsonObject {
  return {
    id: row.id,
    accountId: row.accountId,
    categoryId: row.categoryId,
    date: calendarDateOf(row.date),
    amount: serializeMoney(row.amount),
    type: row.type,
    payee: row.payee,
    isSystem: row.isSystem,
    transferId: row.transferId,
    counterAccountId,
    createdAt: row.createdAt.toISOString(),
  };
}

export function decodeTransaction(stored: Prisma.JsonValue): TransactionResponse {
  if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) {
    throw new Error(`A stored record is not an object: ${JSON.stringify(stored)}`);
  }

  const { id, accountId, categoryId, date, amount, type, payee, isSystem } = stored;
  const { transferId, counterAccountId, createdAt } = stored;

  if (
    typeof id !== 'string' ||
    typeof accountId !== 'string' ||
    typeof date !== 'string' ||
    typeof amount !== 'string' ||
    typeof isSystem !== 'boolean' ||
    typeof createdAt !== 'string' ||
    !isTransactionType(type)
  ) {
    throw new Error(`A stored record is missing fields: ${JSON.stringify(stored)}`);
  }

  return {
    id,
    accountId,
    categoryId: typeof categoryId === 'string' ? categoryId : null,
    date: parseCalendarDate(date),
    amount,
    type,
    payee: typeof payee === 'string' ? payee : null,
    isSystem,
    transferId: typeof transferId === 'string' ? transferId : null,
    counterAccountId: typeof counterAccountId === 'string' ? counterAccountId : null,
    createdAt,
  };
}
