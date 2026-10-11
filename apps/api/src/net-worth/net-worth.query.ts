import { Prisma } from '@rondo/db';

import { openAccountBalances } from '@/accounts/account-balances.query';
import { type RawQueryScope } from '@/raw-sql/scoped-raw.repository';

export interface NetWorthRow {
  total: bigint;
  accountsTotal: bigint;
  assetsTotal: bigint;
  liabilitiesTotal: bigint;
  kind: string | null;
  id: string | null;
  name: string | null;
  type: string | null;
  amount: bigint | null;
  day: string | null;
}

export function netWorthStatement(scope: RawQueryScope, budgetId: string): Prisma.Sql {
  const { userId } = scope;

  return Prisma.sql`
    WITH ${openAccountBalances(scope, budgetId)},
    owned AS (
      SELECT s.id, s.name, s.amount, s.date, s.created_at
      FROM asset s
      WHERE s.user_id = ${userId} AND s.budget_id = ${budgetId}::uuid
    ),
    owed AS (
      SELECT l.id, l.name, l.amount, l.date, l.created_at
      FROM liability l
      WHERE l.user_id = ${userId} AND l.budget_id = ${budgetId}::uuid
    ),
    totals AS (
      SELECT
        (SELECT COALESCE(SUM(balance), 0) FROM visible)::bigint AS accounts_total,
        (SELECT COALESCE(SUM(amount), 0) FROM owned)::bigint AS assets_total,
        (SELECT COALESCE(SUM(amount), 0) FROM owed)::bigint AS liabilities_total
    ),
    entries AS (
      SELECT
        'account' AS kind,
        1 AS kind_rank,
        v.id,
        v.name,
        v.type,
        v.balance::bigint AS amount,
        NULL::text AS day,
        v.created_at
      FROM visible v
      UNION ALL
      SELECT
        'asset',
        2,
        o.id,
        o.name,
        NULL::text,
        o.amount::bigint,
        to_char(o.date, 'YYYY-MM-DD'),
        o.created_at
      FROM owned o
      UNION ALL
      SELECT
        'liability',
        3,
        d.id,
        d.name,
        NULL::text,
        d.amount::bigint,
        to_char(d.date, 'YYYY-MM-DD'),
        d.created_at
      FROM owed d
    )
    SELECT
      (totals.accounts_total + totals.assets_total - totals.liabilities_total)::bigint AS "total",
      totals.accounts_total AS "accountsTotal",
      totals.assets_total AS "assetsTotal",
      totals.liabilities_total AS "liabilitiesTotal",
      e.kind AS "kind",
      e.id AS "id",
      e.name AS "name",
      e.type AS "type",
      e.amount AS "amount",
      e.day AS "day"
    FROM totals
    LEFT JOIN entries e ON true
    ORDER BY e.kind_rank, e.created_at, e.id
  `;
}
