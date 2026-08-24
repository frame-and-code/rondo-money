import { Inject, Injectable } from '@nestjs/common';
import { type Budget, type Language, type Prisma } from '@rondo/db';
import { minorDigits } from '@rondo/types';

import { BudgetResponse } from '@/budgets/budget.response';
import { CreateBudgetDto } from '@/budgets/create-budget.dto';
import { defaultCategories } from '@/budgets/default-categories';
import { MutationService, type MutationClient } from '@/mutations/mutation.service';
import { SCOPED_PRISMA, type ScopedPrismaClient } from '@/prisma/scoped-prisma';
import { toLanguage } from '@/user-settings/language';

function serialize(budget: Budget): Prisma.JsonObject {
  return {
    id: budget.id,
    name: budget.name,
    currency: budget.currency,
    minorDigits: budget.minorDigits,
    timezone: budget.timezone,
    active: budget.active,
  };
}

/// Runs on the fresh path and on the replay alike, so a stored result cannot drift from a
/// fresh one. It narrows rather than casts: the row is `JsonValue`, and a cast would promise
/// the caller a shape the row may not carry.
function decodeBudget(stored: Prisma.JsonValue): BudgetResponse {
  if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) {
    throw new Error(`A stored budget is not an object: ${JSON.stringify(stored)}`);
  }

  const { id, name, currency, minorDigits: digits, timezone, active } = stored;
  if (
    typeof id !== 'string' ||
    typeof name !== 'string' ||
    typeof currency !== 'string' ||
    typeof digits !== 'number' ||
    typeof timezone !== 'string' ||
    typeof active !== 'boolean'
  ) {
    throw new Error(`A stored budget is missing fields: ${JSON.stringify(stored)}`);
  }

  return { id, name, currency, minorDigits: digits, timezone, active };
}

@Injectable()
export class BudgetsService {
  constructor(
    @Inject(SCOPED_PRISMA) private readonly prisma: ScopedPrismaClient,
    private readonly mutations: MutationService,
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
        await this.deactivateCurrent(tx);

        // The user may have no settings row yet: it is created by their first `GET
        // /user-settings`, and a visitor who came straight to this screen never made that call.
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

  /// Explicitly, and before the new row is written. The one-active-per-user index is partial,
  /// so a second active row is a P2002, which the mutation service reads as a repeated
  /// idempotency key and reports as something else entirely.
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
        })),
      });
    }
  }
}
