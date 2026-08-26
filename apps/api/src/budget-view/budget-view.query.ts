import { Prisma } from '@rondo/db';
import { type CalendarDate } from '@rondo/types';

import { type RawQueryScope } from '@/raw-sql/scoped-raw.repository';

export interface BudgetViewBounds {
  monthStart: CalendarDate;
  nextMonthStart: CalendarDate;

  hiddenFrom: Date;
}

export interface BudgetViewRow {
  readyToAssign: bigint;
  groupId: string | null;
  groupName: string | null;
  categoryId: string | null;
  categoryName: string | null;
  assigned: bigint;
  activity: bigint;
  available: bigint;
}

export function budgetViewStatement(
  scope: RawQueryScope,
  budgetId: string,
  bounds: BudgetViewBounds,
): Prisma.Sql {
  const { userId } = scope;
  const { monthStart, nextMonthStart, hiddenFrom } = bounds;

  return Prisma.sql`
    WITH activity AS (
      SELECT
        t.category_id,
        SUM(t.amount) FILTER (
          WHERE t.date >= ${monthStart}::date AND t.date < ${nextMonthStart}::date
        ) AS in_month,
        SUM(t.amount) FILTER (WHERE t.date < ${nextMonthStart}::date) AS to_date,
        SUM(t.amount) AS all_time
      FROM "transaction" t
      WHERE t.user_id = ${userId} AND t.budget_id = ${budgetId}::uuid
      GROUP BY t.category_id
    ),
    assigned AS (
      SELECT
        a.category_id,
        SUM(a.amount) FILTER (WHERE a.month = ${monthStart}::date) AS in_month,
        SUM(a.amount) FILTER (WHERE a.month <= ${monthStart}::date) AS to_date,
        SUM(a.amount) AS all_time
      FROM assignment a
      WHERE a.user_id = ${userId} AND a.budget_id = ${budgetId}::uuid
      GROUP BY a.category_id
    ),
    pool AS (
      SELECT
        COALESCE((SELECT SUM(all_time) FROM activity WHERE category_id IS NULL), 0)
          - COALESCE((SELECT SUM(all_time) FROM assigned), 0) AS ready_to_assign
    )
    SELECT
      pool.ready_to_assign::bigint AS "readyToAssign",
      g.id AS "groupId",
      g.name AS "groupName",
      c.id AS "categoryId",
      c.name AS "categoryName",
      COALESCE(assigned.in_month, 0)::bigint AS "assigned",
      COALESCE(activity.in_month, 0)::bigint AS "activity",
      (COALESCE(assigned.to_date, 0) + COALESCE(activity.to_date, 0))::bigint AS "available"
    FROM pool
    LEFT JOIN category_group g
      ON g.user_id = ${userId}
      AND g.budget_id = ${budgetId}::uuid
      AND (g.hidden_at IS NULL OR g.hidden_at >= ${hiddenFrom})
    LEFT JOIN category c
      ON c.group_id = g.id
      AND c.user_id = ${userId}
      AND c.budget_id = ${budgetId}::uuid
      AND (c.hidden_at IS NULL OR c.hidden_at >= ${hiddenFrom})
    LEFT JOIN assigned ON assigned.category_id = c.id
    LEFT JOIN activity ON activity.category_id = c.id
    ORDER BY g.sort_order, g.name, c.sort_order, c.name
  `;
}
