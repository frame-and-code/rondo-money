import { type CalendarMonth, type TargetKind } from '@rondo/types';

import { liveTarget } from '@/categories/target-window';

export interface TemplateTreeRow {
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
  targetStartMonth: CalendarMonth | null;
  targetDueMonth: CalendarMonth | null;
  targetEndMonth: CalendarMonth | null;
}

export interface CopiedGoal {
  kind: TargetKind;
  amount: bigint;
  startMonth: CalendarMonth;
  dueMonth: CalendarMonth | null;
}

export interface CopiedCategory {
  name: string;
  sortOrder: number;
  icon: string | null;
  color: string | null;
  goal: CopiedGoal | null;
}

export interface CopiedGroup {
  name: string;
  sortOrder: number;
  categories: CopiedCategory[];
}

export interface MoneyScale {
  currency: string;
  minorDigits: number;
}

interface GoalRow {
  id: string;
  kind: TargetKind;
  amount: bigint;
  startMonth: CalendarMonth;
  dueMonth: CalendarMonth | null;
  endMonth: CalendarMonth | null;
}

interface CategoryInProgress {
  name: string;
  icon: string | null;
  color: string | null;
  goals: GoalRow[];
}

interface GroupInProgress {
  name: string;
  categories: Map<string, CategoryInProgress>;
}

export function goalsComeAlong(template: MoneyScale, copy: MoneyScale): boolean {
  return template.currency === copy.currency && template.minorDigits === copy.minorDigits;
}

function goalOf(row: TemplateTreeRow): GoalRow | null {
  if (
    row.targetId === null ||
    row.targetKind === null ||
    row.targetAmount === null ||
    row.targetStartMonth === null
  ) {
    return null;
  }

  return {
    id: row.targetId,
    kind: row.targetKind,
    amount: row.targetAmount,
    startMonth: row.targetStartMonth,
    dueMonth: row.targetDueMonth,
    endMonth: row.targetEndMonth,
  };
}

function gathered(rows: readonly TemplateTreeRow[]): GroupInProgress[] {
  const groups = new Map<string, GroupInProgress>();

  for (const row of rows) {
    const group: GroupInProgress = groups.get(row.groupId) ?? {
      name: row.groupName,
      categories: new Map<string, CategoryInProgress>(),
    };
    groups.set(row.groupId, group);

    if (row.categoryId === null || row.categoryName === null) {
      continue;
    }

    const category: CategoryInProgress = group.categories.get(row.categoryId) ?? {
      name: row.categoryName,
      icon: row.icon,
      color: row.color,
      goals: [],
    };
    group.categories.set(row.categoryId, category);

    const goal = goalOf(row);
    if (goal !== null) {
      category.goals.push(goal);
    }
  }

  return [...groups.values()];
}

export function copiedTree(
  rows: readonly TemplateTreeRow[],
  options: { month: CalendarMonth; withGoals: boolean },
): CopiedGroup[] {
  const startingOver = (goals: readonly GoalRow[]): CopiedGoal | null => {
    const live = options.withGoals ? liveTarget(goals, options.month) : null;

    return live === null
      ? null
      : {
          kind: live.kind,
          amount: live.amount,
          startMonth: options.month,
          dueMonth: live.dueMonth,
        };
  };

  return gathered(rows).map((group, groupIndex) => ({
    name: group.name,
    sortOrder: groupIndex,
    categories: [...group.categories.values()].map((category, categoryIndex) => ({
      name: category.name,
      sortOrder: categoryIndex,
      icon: category.icon,
      color: category.color,
      goal: startingOver(category.goals),
    })),
  }));
}
