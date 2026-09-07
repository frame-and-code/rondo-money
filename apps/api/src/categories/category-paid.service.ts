import { Inject, Injectable } from '@nestjs/common';
import { type Prisma } from '@rondo/db';
import { parseCalendarMonth, toDbMonth, type CalendarMonth } from '@rondo/types';

import { lockCategories } from '@/categories/available';
import { CategoryPaidMonthDto } from '@/categories/category-paid.dto';
import { CategoryPaidMonthResponse } from '@/categories/category-paid.response';
import { NO_ACTIVE_BUDGET, refuse } from '@/categories/category-refusal';
import { MutationService, type MutationClient } from '@/mutations/mutation.service';
import { SCOPED_PRISMA, type ScopedPrismaClient } from '@/prisma/scoped-prisma';
import { ScopedRawRepository } from '@/raw-sql/scoped-raw.repository';

function serialize(categoryId: string, month: CalendarMonth, paid: boolean): Prisma.JsonObject {
  return { categoryId, month, paid };
}

function decode(stored: Prisma.JsonValue): CategoryPaidMonthResponse {
  if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) {
    throw new Error(`A stored paid mark is not an object: ${JSON.stringify(stored)}`);
  }

  const { categoryId, month, paid } = stored;
  if (typeof categoryId !== 'string' || typeof month !== 'string' || typeof paid !== 'boolean') {
    throw new Error(`A stored paid mark is missing fields: ${JSON.stringify(stored)}`);
  }

  return { categoryId, month: parseCalendarMonth(month), paid };
}

@Injectable()
export class CategoryPaidService {
  constructor(
    @Inject(SCOPED_PRISMA) private readonly prisma: ScopedPrismaClient,
    private readonly mutations: MutationService,
    private readonly raw: ScopedRawRepository,
  ) {}

  async mark(
    userId: string,
    categoryId: string,
    body: CategoryPaidMonthDto,
  ): Promise<CategoryPaidMonthResponse> {
    const intended = await this.activeBudget(this.prisma);
    const month = parseCalendarMonth(body.month);

    return this.mutations.run(
      {
        key: body.idempotencyKey,
        request: { budgetId: intended.id, categoryId, month, act: 'paid' },
        decode,
      },
      async (tx) => {
        const budget = await this.activeBudget(tx, intended.id);
        await this.openCategory(tx, budget.id, categoryId);

        const held = await tx.categoryPaidMonth.findFirst({
          where: { categoryId, month: toDbMonth(month) },
        });

        if (held === null) {
          await tx.categoryPaidMonth.create({
            data: { userId, budgetId: budget.id, categoryId, month: toDbMonth(month) },
          });
        }

        return serialize(categoryId, month, true);
      },
    );
  }

  async unmark(categoryId: string, body: CategoryPaidMonthDto): Promise<CategoryPaidMonthResponse> {
    const intended = await this.activeBudget(this.prisma);
    const month = parseCalendarMonth(body.month);

    return this.mutations.run(
      {
        key: body.idempotencyKey,
        request: { budgetId: intended.id, categoryId, month, act: 'unpaid' },
        decode,
      },
      async (tx) => {
        const budget = await this.activeBudget(tx, intended.id);
        await this.openCategory(tx, budget.id, categoryId);

        await tx.categoryPaidMonth.deleteMany({
          where: { categoryId, month: toDbMonth(month) },
        });

        return serialize(categoryId, month, false);
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
        `Category ${categoryId} is hidden, and a hidden envelope is not marked paid.`,
      );
    }
  }

  private async activeBudget(
    client: MutationClient | ScopedPrismaClient,
    id?: string,
  ): Promise<{ id: string }> {
    const budget = await client.budget.findFirst({
      where: { active: true, ...(id ? { id } : {}) },
    });
    if (!budget) {
      throw refuse('NO_ACTIVE_BUDGET', NO_ACTIVE_BUDGET);
    }

    return budget;
  }
}
