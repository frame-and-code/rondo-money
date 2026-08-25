import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import {
  monthStartInstant,
  nextCalendarMonth,
  parseCalendarDate,
  serializeMoney,
  type CalendarMonth,
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

  /// The month window is a pair of calendar dates, because a transaction and an assignment
  /// carry dates without a time. The visibility boundary is an instant, because a hiding
  /// carries one, and it is the only place the budget's timezone is needed.
  private boundsOf(month: CalendarMonth, timezone: string): BudgetViewBounds {
    const next = nextCalendarMonth(month);

    return {
      monthStart: parseCalendarDate(`${month}-01`),
      nextMonthStart: parseCalendarDate(`${next}-01`),
      hiddenFrom: monthStartInstant(next, timezone),
    };
  }

  /// Asked before the aggregate runs, because a raw statement takes the budget as a value: with
  /// none, the sums would be collected over no budget at all and answer a screen full of zeros
  /// to a user who is simply part way through onboarding.
  private async activeBudget(userId: string): Promise<{ id: string; timezone: string }> {
    const budget = await this.prisma.budget.findFirst({ where: { userId, active: true } });
    if (!budget) {
      throw new BadRequestException(NO_ACTIVE_BUDGET);
    }

    return budget;
  }
}
