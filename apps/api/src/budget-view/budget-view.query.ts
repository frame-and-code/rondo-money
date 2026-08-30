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
  categoryIcon: string | null;
  categoryColor: string | null;
  groupHidden: boolean;
  categoryHidden: boolean;
  availableAllTime: bigint;
  assigned: bigint;
  activity: bigint;
  available: bigint;
  targetKind: string | null;
  targetAmount: bigint | null;
  targetStartMonth: string | null;
  targetDueMonth: string | null;
  targetFunded: bigint | null;
  targetAssignedBefore: bigint | null;
  targetActivityBefore: bigint | null;
}

export interface BudgetViewOptions {
  includeHidden: boolean;
}

export function budgetViewStatement(
  scope: RawQueryScope,
  budgetId: string,
  bounds: BudgetViewBounds,
  options: BudgetViewOptions = { includeHidden: false },
): Prisma.Sql {
  const { userId } = scope;
  const { monthStart, nextMonthStart, hiddenFrom } = bounds;

  const visibleGroup = options.includeHidden
    ? Prisma.empty
    : Prisma.sql`AND (g.hidden_at IS NULL OR g.hidden_at >= ${hiddenFrom})`;
  const visibleCategory = options.includeHidden
    ? Prisma.empty
    : Prisma.sql`AND (c.hidden_at IS NULL OR c.hidden_at >= ${hiddenFrom})`;

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
    active_target AS (
      SELECT DISTINCT ON (t.category_id)
        t.category_id,
        t.kind::text AS kind,
        t.amount,
        t.start_month,
        t.due_month
      FROM category_target t
      WHERE t.user_id = ${userId}
        AND t.budget_id = ${budgetId}::uuid
        AND t.start_month <= ${monthStart}::date
        AND (t.end_month IS NULL OR t.end_month >= ${monthStart}::date)
        AND (t.due_month IS NULL OR t.due_month >= ${monthStart}::date)
      ORDER BY t.category_id, t.start_month DESC
    ),
    target_assigned AS (
      SELECT
        tgt.category_id,
        COALESCE(SUM(a.amount) FILTER (
          WHERE a.month >= tgt.start_month AND a.month <= ${monthStart}::date
        ), 0) AS funded,
        COALESCE(SUM(a.amount) FILTER (WHERE a.month < tgt.start_month), 0) AS assigned_before
      FROM active_target tgt
      LEFT JOIN assignment a
        ON a.category_id = tgt.category_id
        AND a.user_id = ${userId}
        AND a.budget_id = ${budgetId}::uuid
      GROUP BY tgt.category_id
    ),
    target_spent AS (
      SELECT tgt.category_id, COALESCE(SUM(t.amount), 0) AS activity_before
      FROM active_target tgt
      LEFT JOIN "transaction" t
        ON t.category_id = tgt.category_id
        AND t.user_id = ${userId}
        AND t.budget_id = ${budgetId}::uuid
        AND t.date < tgt.start_month
      GROUP BY tgt.category_id
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
      c.icon AS "categoryIcon",
      c.color AS "categoryColor",
      COALESCE(assigned.in_month, 0)::bigint AS "assigned",
      COALESCE(activity.in_month, 0)::bigint AS "activity",
      (COALESCE(assigned.to_date, 0) + COALESCE(activity.to_date, 0))::bigint AS "available",
      (COALESCE(assigned.all_time, 0) + COALESCE(activity.all_time, 0))::bigint AS "availableAllTime",
      tgt.kind AS "targetKind",
      tgt.amount::bigint AS "targetAmount",
      to_char(tgt.start_month, 'YYYY-MM') AS "targetStartMonth",
      to_char(tgt.due_month, 'YYYY-MM') AS "targetDueMonth",
      COALESCE(tas.funded, 0)::bigint AS "targetFunded",
      COALESCE(tas.assigned_before, 0)::bigint AS "targetAssignedBefore",
      COALESCE(tsp.activity_before, 0)::bigint AS "targetActivityBefore",
      COALESCE(g.hidden_at < ${hiddenFrom}, false) AS "groupHidden",
      COALESCE(c.hidden_at < ${hiddenFrom}, false) AS "categoryHidden"
    FROM pool
    LEFT JOIN category_group g
      ON g.user_id = ${userId}
      AND g.budget_id = ${budgetId}::uuid
      ${visibleGroup}
    LEFT JOIN category c
      ON c.group_id = g.id
      AND c.user_id = ${userId}
      AND c.budget_id = ${budgetId}::uuid
      ${visibleCategory}
    LEFT JOIN assigned ON assigned.category_id = c.id
    LEFT JOIN activity ON activity.category_id = c.id
    LEFT JOIN active_target tgt ON tgt.category_id = c.id
    LEFT JOIN target_assigned tas ON tas.category_id = c.id
    LEFT JOIN target_spent tsp ON tsp.category_id = c.id
    ORDER BY g.sort_order, g.name, c.sort_order, c.name
  `;
}
