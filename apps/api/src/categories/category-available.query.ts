import { Prisma } from '@rondo/db';

import { type RawQueryScope } from '@/raw-sql/scoped-raw.repository';

export interface CategoryAvailableRow {
  categoryId: string;
  available: bigint;
}

export interface CategoryLockRow {
  id: string;
  hiddenAt: Date | null;
  groupId: string;
}

export function categoryLockStatement(
  scope: RawQueryScope,
  budgetId: string,
  categoryIds: readonly string[],
): Prisma.Sql {
  return Prisma.sql`
    SELECT c.id AS "id", c.hidden_at AS "hiddenAt", c.group_id AS "groupId"
    FROM category c
    WHERE c.user_id = ${scope.userId}
      AND c.budget_id = ${budgetId}::uuid
      AND c.id = ANY(${[...categoryIds]}::uuid[])
    ORDER BY c.id
    FOR UPDATE
  `;
}

export function categoryAvailableStatement(
  scope: RawQueryScope,
  budgetId: string,
  categoryIds: readonly string[],
): Prisma.Sql {
  const { userId } = scope;
  const wanted = [...categoryIds];

  return Prisma.sql`
    WITH assigned AS (
      SELECT a.category_id, SUM(a.amount) AS total
      FROM assignment a
      WHERE a.user_id = ${userId}
        AND a.budget_id = ${budgetId}::uuid
        AND a.category_id = ANY(${wanted}::uuid[])
      GROUP BY a.category_id
    ),
    spent AS (
      SELECT t.category_id, SUM(t.amount) AS total
      FROM "transaction" t
      WHERE t.user_id = ${userId}
        AND t.budget_id = ${budgetId}::uuid
        AND t.category_id = ANY(${wanted}::uuid[])
      GROUP BY t.category_id
    )
    SELECT
      COALESCE(assigned.category_id, spent.category_id) AS "categoryId",
      (COALESCE(assigned.total, 0) + COALESCE(spent.total, 0))::bigint AS "available"
    FROM assigned
    FULL OUTER JOIN spent ON spent.category_id = assigned.category_id
  `;
}
