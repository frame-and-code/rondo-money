import { Inject, Injectable } from '@nestjs/common';
import { type Budget, type Language, type Prisma } from '@rondo/db';
import {
  calendarDateIn,
  minorDigits,
  monthOf,
  parseCalendarDate,
  parseCalendarMonth,
} from '@rondo/types';

import { budgetsLockStatement } from '@/budgets/budget-lock.query';
import { refuseBudget } from '@/budgets/budget-refusal';
import { BudgetResponse } from '@/budgets/budget.response';
import { CreateBudgetDto } from '@/budgets/create-budget.dto';
import { defaultCategories } from '@/budgets/default-categories';
import { RenameBudgetDto } from '@/budgets/rename-budget.dto';
import { MutationService, type MutationClient } from '@/mutations/mutation.service';
import { SCOPED_PRISMA, type ScopedPrismaClient } from '@/prisma/scoped-prisma';
import { ScopedRawRepository } from '@/raw-sql/scoped-raw.repository';
import { toLanguage } from '@/user-settings/language';

function serialize(budget: Budget): Prisma.JsonObject {
  const createdOn = calendarDateIn(budget.createdAt, budget.timezone);

  return {
    id: budget.id,
    name: budget.name,
    currency: budget.currency,
    minorDigits: budget.minorDigits,
    timezone: budget.timezone,
    firstMonth: monthOf(createdOn),
    createdOn,
    active: budget.active,
  };
}

function decodeBudget(stored: Prisma.JsonValue): BudgetResponse {
  if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) {
    throw new Error(`A stored budget is not an object: ${JSON.stringify(stored)}`);
  }

  const {
    id,
    name,
    currency,
    minorDigits: digits,
    timezone,
    firstMonth,
    createdOn,
    active,
  } = stored;
  if (
    typeof id !== 'string' ||
    typeof name !== 'string' ||
    typeof currency !== 'string' ||
    typeof digits !== 'number' ||
    typeof timezone !== 'string' ||
    typeof firstMonth !== 'string' ||
    typeof createdOn !== 'string' ||
    typeof active !== 'boolean'
  ) {
    throw new Error(`A stored budget is missing fields: ${JSON.stringify(stored)}`);
  }

  return {
    id,
    name,
    currency,
    minorDigits: digits,
    timezone,
    firstMonth: parseCalendarMonth(firstMonth),
    createdOn: parseCalendarDate(createdOn),
    active,
  };
}

@Injectable()
export class BudgetsService {
  constructor(
    @Inject(SCOPED_PRISMA) private readonly prisma: ScopedPrismaClient,
    private readonly mutations: MutationService,
    private readonly raw: ScopedRawRepository,
  ) {}

  create(userId: string, body: CreateBudgetDto): Promise<BudgetResponse> {
    const language = toLanguage(body.language);

    return this.mutations.run(
      {
        key: body.idempotencyKey,
        request: {
          language: body.language,
          name: body.name,
          currency: body.currency,
          timezone: body.timezone,
          withDefaultCategories: body.withDefaultCategories,
        },
        decode: decodeBudget,
      },
      async (tx) => {
        await this.holdBudgets(tx);
        await this.deactivateCurrent(tx);

        await tx.userSettings.upsert({
          where: { userId },
          create: { userId, language },
          update: { language },
        });

        const budget = await tx.budget.create({
          data: {
            userId,
            name: body.name,
            currency: body.currency,
            minorDigits: minorDigits(body.currency),
            timezone: body.timezone,
            active: true,
          },
        });

        if (body.withDefaultCategories) {
          await this.writeDefaultCategories(tx, userId, budget.id, language);
        }

        return serialize(budget);
      },
    );
  }

  async list(userId: string): Promise<BudgetResponse[]> {
    const budgets = await this.prisma.budget.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });

    return budgets.map((budget) => decodeBudget(serialize(budget)));
  }

  rename(id: string, body: RenameBudgetDto): Promise<BudgetResponse> {
    return this.mutations.run(
      {
        key: body.idempotencyKey,
        request: { id, name: body.name },
        decode: decodeBudget,
      },
      async (tx) => {
        await this.ownedBudget(tx, id);

        return serialize(await tx.budget.update({ where: { id }, data: { name: body.name } }));
      },
    );
  }

  activate(id: string, key: string): Promise<BudgetResponse> {
    return this.mutations.run(
      {
        key,
        request: { id, act: 'activate' },
        decode: decodeBudget,
      },
      async (tx) => {
        await this.holdBudgets(tx);

        const target = await this.ownedBudget(tx, id);
        if (target.active) {
          return serialize(target);
        }

        await this.deactivateCurrent(tx);

        return serialize(await tx.budget.update({ where: { id }, data: { active: true } }));
      },
    );
  }

  private async holdBudgets(tx: MutationClient): Promise<void> {
    await this.raw.query<{ id: string }>((scope) => budgetsLockStatement(scope), tx);
  }

  private async ownedBudget(tx: MutationClient, id: string): Promise<Budget> {
    const budget = await tx.budget.findFirst({ where: { id } });
    if (!budget) {
      throw refuseBudget('UNKNOWN_BUDGET');
    }

    return budget;
  }

  private async deactivateCurrent(tx: MutationClient): Promise<void> {
    const active = await tx.budget.findFirst({ where: { active: true } });
    if (active) {
      await tx.budget.update({ where: { id: active.id }, data: { active: false } });
    }
  }

  private async writeDefaultCategories(
    tx: MutationClient,
    userId: string,
    budgetId: string,
    language: Language,
  ): Promise<void> {
    for (const group of defaultCategories(language)) {
      const written = await tx.categoryGroup.create({
        data: { userId, budgetId, name: group.name, sortOrder: group.sortOrder },
      });

      await tx.category.createMany({
        data: group.categories.map((category) => ({
          userId,
          budgetId,
          groupId: written.id,
          name: category.name,
          sortOrder: category.sortOrder,
          icon: category.icon,
          color: category.color,
        })),
      });
    }
  }
}
