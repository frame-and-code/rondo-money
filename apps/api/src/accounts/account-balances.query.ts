import { Prisma } from '@rondo/db';

import { type RawQueryScope } from '@/raw-sql/scoped-raw.repository';

export interface AccountBalanceRow {
  total: bigint;
  accountId: string | null;
  name: string | null;
  type: string | null;
  balance: bigint;
  entries: bigint;
}

export function accountBalancesStatement(scope: RawQueryScope, budgetId: string): Prisma.Sql {
  const { userId } = scope;

  return Prisma.sql`
    WITH balances AS (
      SELECT
        t.account_id,
        SUM(t.amount) AS amount,
        COUNT(*) FILTER (WHERE NOT t.is_system) AS entries
      FROM "transaction" t
      WHERE t.user_id = ${userId} AND t.budget_id = ${budgetId}::uuid
      GROUP BY t.account_id
    ),
    visible AS (
      SELECT
        a.id,
        a.name,
        a.type::text AS type,
        a.created_at,
        COALESCE(balances.amount, 0) AS balance,
        COALESCE(balances.entries, 0) AS entries
      FROM account a
      LEFT JOIN balances ON balances.account_id = a.id
      WHERE a.user_id = ${userId}
        AND a.budget_id = ${budgetId}::uuid
        AND a.archived_at IS NULL
    ),
    pool AS (
      SELECT COALESCE(SUM(balance), 0) AS total FROM visible
    )
    SELECT
      pool.total::bigint AS "total",
      v.id AS "accountId",
      v.name AS "name",
      v.type AS "type",
      COALESCE(v.balance, 0)::bigint AS "balance",
      COALESCE(v.entries, 0)::bigint AS "entries"
    FROM pool
    LEFT JOIN visible v ON true
    ORDER BY v.created_at, v.id
  `;
}
