import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import {
  isCategoryColor,
  isCategoryIcon,
  monthStartInstant,
  nextCalendarMonth,
  parseCalendarDate,
  serializeMoney,
  type CalendarMonth,
  type CategoryColor,
  type CategoryIcon,
} from '@rondo/types';

import {
  budgetViewStatement,
  type BudgetViewBounds,
  type BudgetViewRow,
} from '@/budget-view/budget-view.query';
import {
  BudgetViewResponse,
  type BudgetViewGroupResponse,
} from '@/budget-view/budget-view.response';
import { SCOPED_PRISMA, type ScopedPrismaClient } from '@/prisma/scoped-prisma';
import { ScopedRawRepository } from '@/raw-sql/scoped-raw.repository';

const NO_ACTIVE_BUDGET =
  'The caller has no active budget, so there is no month to read. Create a budget first.';

function iconOf(stored: string | null): CategoryIcon | null {
  return isCategoryIcon(stored) ? stored : null;
}

function colorOf(stored: string | null): CategoryColor | null {
  return isCategoryColor(stored) ? stored : null;
}

function assemble(rows: BudgetViewRow[]): BudgetViewGroupResponse[] {
  const groups = new Map<string, BudgetViewGroupResponse>();

  for (const row of rows) {
    if (row.groupId === null || row.groupName === null) {
      continue;
    }

    const group = groups.get(row.groupId) ?? {
      id: row.groupId,
      name: row.groupName,
      categories: [],
    };
    groups.set(row.groupId, group);

    if (row.categoryId !== null && row.categoryName !== null) {
      group.categories.push({
        id: row.categoryId,
        name: row.categoryName,
        icon: iconOf(row.categoryIcon),
        color: colorOf(row.categoryColor),
        assigned: serializeMoney(row.assigned),
        activity: serializeMoney(row.activity),
        available: serializeMoney(row.available),
      });
    }
  }

  return [...groups.values()];
}

@Injectable()
export class BudgetViewService {
  constructor(
    @Inject(SCOPED_PRISMA) private readonly prisma: ScopedPrismaClient,
    private readonly raw: ScopedRawRepository,
  ) {}

  async read(userId: string, month: CalendarMonth): Promise<BudgetViewResponse> {
    const budget = await this.activeBudget(userId);
    const bounds = this.boundsOf(month, budget.timezone);

    const rows = await this.raw.query<BudgetViewRow>((scope) =>
      budgetViewStatement(scope, budget.id, bounds),
    );

    const [pool] = rows;
    if (!pool) {
      throw new Error(
        'The budget view statement answered with no rows: it always returns at least one, ' +
          'carrying the pool, so an empty answer means the statement no longer starts from it.',
      );
    }

    return {
      month,
      readyToAssign: serializeMoney(pool.readyToAssign),
      groups: assemble(rows),
    };
  }

  private boundsOf(month: CalendarMonth, timezone: string): BudgetViewBounds {
    const next = nextCalendarMonth(month);

    return {
      monthStart: parseCalendarDate(`${month}-01`),
      nextMonthStart: parseCalendarDate(`${next}-01`),
      hiddenFrom: monthStartInstant(next, timezone),
    };
  }

  private async activeBudget(userId: string): Promise<{ id: string; timezone: string }> {
    const budget = await this.prisma.budget.findFirst({ where: { userId, active: true } });
    if (!budget) {
      throw new BadRequestException(NO_ACTIVE_BUDGET);
    }

    return budget;
  }
}
