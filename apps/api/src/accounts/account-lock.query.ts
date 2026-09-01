import { Prisma } from '@rondo/db';

import { type RawQueryScope } from '@/raw-sql/scoped-raw.repository';

export function accountLockStatement(
  scope: RawQueryScope,
  budgetId: string,
  accountId: string,
): Prisma.Sql {
  return Prisma.sql`
    SELECT a.id AS "id", a.created_at AS "createdAt", a.archived_at AS "archivedAt"
    FROM account a
    WHERE a.user_id = ${scope.userId}
      AND a.budget_id = ${budgetId}::uuid
      AND a.id = ${accountId}::uuid
    FOR UPDATE
  `;
}

export function openAccountsStatement(
  scope: RawQueryScope,
  budgetId: string,
  accountIds: readonly string[],
): Prisma.Sql {
  return Prisma.sql`
    SELECT a.id AS "id", a.created_at AS "createdAt", a.archived_at AS "archivedAt"
    FROM account a
    WHERE a.user_id = ${scope.userId}
      AND a.budget_id = ${budgetId}::uuid
      AND a.id = ANY(${[...accountIds]}::uuid[])
    ORDER BY a.id
    FOR SHARE
  `;
}
