import { Prisma, type AccountType } from '@rondo/db';
import { type TargetKind } from '@rondo/types';

import { type RawQueryScope } from '@/raw-sql/scoped-raw.repository';

export interface CategoryTreeRecord {
  groupId: string;
  groupName: string;
  groupSortOrder: number;
  categoryId: string | null;
  categoryName: string | null;
  categorySortOrder: number | null;
  icon: string | null;
  color: string | null;
  targetId: string | null;
  targetKind: TargetKind | null;
  targetAmount: bigint | null;
  targetStartMonth: Date | null;
  targetDueMonth: Date | null;
  targetEndMonth: Date | null;
}

export interface OpenAccountRecord {
  name: string;
  type: AccountType;
}

export interface NetWorthItemRecord {
  name: string;
}

export function categoryTreeStatement(scope: RawQueryScope, budgetId: string): Prisma.Sql {
  const { userId } = scope;

  return Prisma.sql`
    WITH shown_group AS (
      SELECT g.id, g.name, g.sort_order
      FROM category_group g
      WHERE g.user_id = ${userId} AND g.budget_id = ${budgetId}::uuid AND g.hidden_at IS NULL
    ),
    shown_category AS (
      SELECT c.id, c.group_id, c.name, c.sort_order, c.icon, c.color
      FROM category c
      WHERE c.user_id = ${userId} AND c.budget_id = ${budgetId}::uuid AND c.hidden_at IS NULL
    ),
    goal AS (
      SELECT t.id, t.category_id, t.kind, t.amount, t.start_month, t.due_month, t.end_month
      FROM category_target t
      WHERE t.user_id = ${userId} AND t.budget_id = ${budgetId}::uuid
    )
    SELECT
      sg.id AS "groupId",
      sg.name AS "groupName",
      sg.sort_order AS "groupSortOrder",
      sc.id AS "categoryId",
      sc.name AS "categoryName",
      sc.sort_order AS "categorySortOrder",
      sc.icon AS "icon",
      sc.color AS "color",
      goal.id AS "targetId",
      goal.kind::text AS "targetKind",
      goal.amount AS "targetAmount",
      goal.start_month AS "targetStartMonth",
      goal.due_month AS "targetDueMonth",
      goal.end_month AS "targetEndMonth"
    FROM shown_group sg
    LEFT JOIN shown_category sc ON sc.group_id = sg.id
    LEFT JOIN goal ON goal.category_id = sc.id
    ORDER BY sg.sort_order, sg.name, sg.id, sc.sort_order, sc.name, sc.id, goal.start_month
  `;
}

export function openAccountsStatement(scope: RawQueryScope, budgetId: string): Prisma.Sql {
  return Prisma.sql`
    SELECT a.name AS "name", a.type::text AS "type"
    FROM account a
    WHERE a.user_id = ${scope.userId} AND a.budget_id = ${budgetId}::uuid
      AND a.archived_at IS NULL
    ORDER BY a.created_at, a.id
  `;
}

export function assetsStatement(scope: RawQueryScope, budgetId: string): Prisma.Sql {
  return Prisma.sql`
    SELECT s.name AS "name"
    FROM asset s
    WHERE s.user_id = ${scope.userId} AND s.budget_id = ${budgetId}::uuid
    ORDER BY s.created_at, s.id
  `;
}

export function liabilitiesStatement(scope: RawQueryScope, budgetId: string): Prisma.Sql {
  return Prisma.sql`
    SELECT l.name AS "name"
    FROM liability l
    WHERE l.user_id = ${scope.userId} AND l.budget_id = ${budgetId}::uuid
    ORDER BY l.created_at, l.id
  `;
}
