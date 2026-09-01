import { Prisma } from '@rondo/db';

import { type RawQueryScope } from '@/raw-sql/scoped-raw.repository';

export interface AccountLockRow {
  id: string;
}

export function accountLockStatement(
  scope: RawQueryScope,
  budgetId: string,
  accountId: string,
): Prisma.Sql {
  return Prisma.sql`
    SELECT a.id AS "id"
    FROM account a
    WHERE a.user_id = ${scope.userId}
      AND a.budget_id = ${budgetId}::uuid
      AND a.id = ${accountId}::uuid
    FOR UPDATE
  `;
}
