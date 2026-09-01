import { Prisma } from '@rondo/db';

import { type RawQueryScope } from '@/raw-sql/scoped-raw.repository';

export interface AccountBalanceOnlyRow {
  balance: bigint;
}

export function accountBalanceStatement(
  scope: RawQueryScope,
  budgetId: string,
  accountId: string,
): Prisma.Sql {
  return Prisma.sql`
    SELECT COALESCE(SUM(t.amount), 0)::bigint AS "balance"
    FROM "transaction" t
    WHERE t.user_id = ${scope.userId}
      AND t.budget_id = ${budgetId}::uuid
      AND t.account_id = ${accountId}::uuid
  `;
}
