import { Inject, Injectable } from '@nestjs/common';
import { type CategoryTarget, type Prisma } from '@rondo/db';
import {
  calendarMonthOf,
  isTargetKind,
  monthOf,
  parseCalendarMonth,
  parseMoney,
  previousCalendarMonth,
  serializeMoney,
  toDbMonth,
  todayIn,
} from '@rondo/types';

import { lockCategories } from '@/categories/available';
import { NO_ACTIVE_BUDGET, refuse } from '@/categories/category-refusal';
import { SetCategoryTargetDto } from '@/categories/category-target.dto';
import { CategoryTargetResponse } from '@/categories/category-target.response';
import { activeInMonth, targetWrite, type TargetRow } from '@/categories/target-window';
import { MutationService, type MutationClient } from '@/mutations/mutation.service';
import { SCOPED_PRISMA, type ScopedPrismaClient } from '@/prisma/scoped-prisma';
import { ScopedRawRepository } from '@/raw-sql/scoped-raw.repository';

interface ActiveBudget {
  id: string;
  timezone: string;
}

function windowOf(row: CategoryTarget): TargetRow {
  return {
    id: row.id,
    kind: row.kind,
    startMonth: calendarMonthOf(row.startMonth),
    dueMonth: row.dueMonth === null ? null : calendarMonthOf(row.dueMonth),
    endMonth: row.endMonth === null ? null : calendarMonthOf(row.endMonth),
  };
}

function serialize(row: CategoryTarget): Prisma.JsonObject {
  return {
    kind: row.kind,
    amount: serializeMoney(row.amount),
    startMonth: calendarMonthOf(row.startMonth),
    dueMonth: row.dueMonth === null ? null : calendarMonthOf(row.dueMonth),
    endMonth: row.endMonth === null ? null : calendarMonthOf(row.endMonth),
  };
}

function decode(stored: Prisma.JsonValue): CategoryTargetResponse {
  if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) {
    throw new Error(`A stored goal is not an object: ${JSON.stringify(stored)}`);
  }

  const { kind, amount, startMonth, dueMonth, endMonth } = stored;
  if (!isTargetKind(kind) || typeof amount !== 'string' || typeof startMonth !== 'string') {
    throw new Error(`A stored goal is missing fields: ${JSON.stringify(stored)}`);
  }

  return {
    kind,
    amount,
    startMonth: parseCalendarMonth(startMonth),
    ...(typeof dueMonth === 'string' ? { dueMonth: parseCalendarMonth(dueMonth) } : {}),
    ...(typeof endMonth === 'string' ? { endMonth: parseCalendarMonth(endMonth) } : {}),
  };
}

@Injectable()
export class CategoryTargetsService {
  constructor(
    @Inject(SCOPED_PRISMA) private readonly prisma: ScopedPrismaClient,
    private readonly mutations: MutationService,
    private readonly raw: ScopedRawRepository,
  ) {}

  async set(
    userId: string,
    categoryId: string,
    body: SetCategoryTargetDto,
  ): Promise<CategoryTargetResponse> {
    const intended = await this.activeBudget(this.prisma);

    return this.mutations.run(
      {
        key: body.idempotencyKey,
        request: {
          budgetId: intended.id,
          categoryId,
          kind: body.kind,
          amount: body.amount,
          dueMonth: body.dueMonth ?? null,
        },
        decode,
      },
      async (tx) => {
        const budget = await this.activeBudget(tx, intended.id);
        const month = monthOf(todayIn(budget.timezone));
        await this.openCategory(tx, budget.id, categoryId);

        const dueMonth = body.dueMonth === undefined ? null : parseCalendarMonth(body.dueMonth);
        if (dueMonth !== null && dueMonth < month) {
          throw refuse(
            'DUE_MONTH_PAST',
            `A goal cannot be due in ${dueMonth}, which this budget has already lived through.`,
          );
        }

        const held = await tx.categoryTarget.findMany({ where: { categoryId } });
        const branch = targetWrite(held.map(windowOf), month, body.kind);
        const amount = parseMoney(body.amount);

        if (branch.act === 'edit') {
          return serialize(
            await tx.categoryTarget.update({
              where: { id: branch.id },
              data: { kind: body.kind, amount, dueMonth: dueMonth && toDbMonth(dueMonth) },
            }),
          );
        }

        if (branch.act === 'closeAndCreate') {
          await tx.categoryTarget.update({
            where: { id: branch.id },
            data: { endMonth: toDbMonth(previousCalendarMonth(month)) },
          });
        }

        if (branch.act === 'overwrite') {
          return serialize(
            await tx.categoryTarget.update({
              where: { id: branch.id },
              data: {
                kind: body.kind,
                amount,
                dueMonth: dueMonth && toDbMonth(dueMonth),
                endMonth: null,
              },
            }),
          );
        }

        return serialize(
          await tx.categoryTarget.create({
            data: {
              userId,
              budgetId: budget.id,
              categoryId,
              kind: body.kind,
              amount,
              startMonth: toDbMonth(month),
              dueMonth: dueMonth && toDbMonth(dueMonth),
            },
          }),
        );
      },
    );
  }

  async close(categoryId: string, key: string): Promise<CategoryTargetResponse> {
    const intended = await this.activeBudget(this.prisma);

    return this.mutations.run(
      { key, request: { budgetId: intended.id, categoryId, act: 'close' }, decode },
      async (tx) => {
        const budget = await this.activeBudget(tx, intended.id);
        const month = monthOf(todayIn(budget.timezone));
        await this.openCategory(tx, budget.id, categoryId);

        const held = await tx.categoryTarget.findMany({ where: { categoryId } });
        const shown = activeInMonth(held.map(windowOf), month);
        if (shown === null) {
          throw refuse(
            'NO_TARGET',
            `Category ${categoryId} carries no goal in ${month}, so there is nothing to close.`,
          );
        }

        return serialize(
          await tx.categoryTarget.update({
            where: { id: shown.id },
            data: { endMonth: toDbMonth(month) },
          }),
        );
      },
    );
  }

  private async openCategory(
    tx: MutationClient,
    budgetId: string,
    categoryId: string,
  ): Promise<void> {
    const [held] = await lockCategories(this.raw, tx, budgetId, [categoryId]);
    if (!held) {
      throw refuse('UNKNOWN_CATEGORY', `This budget holds no category ${categoryId}.`);
    }

    if (held.hiddenAt !== null) {
      throw refuse(
        'CATEGORY_HIDDEN',
        `Category ${categoryId} is hidden, and a hidden envelope is not given a goal.`,
      );
    }
  }

  private async activeBudget(
    client: MutationClient | ScopedPrismaClient,
    id?: string,
  ): Promise<ActiveBudget> {
    const budget = await client.budget.findFirst({
      where: { active: true, ...(id ? { id } : {}) },
    });
    if (!budget) {
      throw refuse('NO_ACTIVE_BUDGET', NO_ACTIVE_BUDGET);
    }

    return budget;
  }
}
