import { Inject, Injectable } from '@nestjs/common';
import { Prisma, TransactionType, type Budget, type Language } from '@rondo/db';
import {
  calendarDateIn,
  calendarMonthOf,
  minorDigits,
  monthOf,
  parseCalendarDate,
  parseCalendarMonth,
  toDbDate,
  toDbMonth,
} from '@rondo/types';

import { copiedTree, goalsComeAlong, type TemplateTreeRow } from '@/budgets/budget-copy';
import { budgetsGateStatement, budgetsLockStatement } from '@/budgets/budget-lock.query';
import { budgetNamedStatement } from '@/budgets/budget-name.query';
import { refuseBudget, refuseMissingBudget } from '@/budgets/budget-refusal';
import {
  assetsStatement,
  categoryTreeStatement,
  liabilitiesStatement,
  openAccountsStatement,
  type CategoryTreeRecord,
  type NetWorthItemRecord,
  type OpenAccountRecord,
} from '@/budgets/budget-structure.query';
import { BudgetResponse } from '@/budgets/budget.response';
import { CreateBudgetDto } from '@/budgets/create-budget.dto';
import { defaultCategories } from '@/budgets/default-categories';
import { RenameBudgetDto } from '@/budgets/rename-budget.dto';
import { MutationService, type MutationClient } from '@/mutations/mutation.service';
import { SCOPED_PRISMA, type ScopedPrismaClient } from '@/prisma/scoped-prisma';
import { ScopedRawRepository } from '@/raw-sql/scoped-raw.repository';
import { toLanguage } from '@/user-settings/language';

const NAME_INDEX = 'budget_name_per_user';

interface Template {
  budget: Budget;
  tree: TemplateTreeRow[];
  accounts: OpenAccountRecord[];
  assets: NetWorthItemRecord[];
  liabilities: NetWorthItemRecord[];
}

const monthOrNone = (stored: Date | null): string | null =>
  stored === null ? null : calendarMonthOf(stored);

function treeRow(record: CategoryTreeRecord): TemplateTreeRow {
  return {
    groupId: record.groupId,
    groupName: record.groupName,
    groupSortOrder: record.groupSortOrder,
    categoryId: record.categoryId,
    categoryName: record.categoryName,
    categorySortOrder: record.categorySortOrder,
    icon: record.icon,
    color: record.color,
    targetId: record.targetId,
    targetKind: record.targetKind,
    targetAmount: record.targetAmount,
    targetStartMonth: monthOrNone(record.targetStartMonth),
    targetDueMonth: monthOrNone(record.targetDueMonth),
    targetEndMonth: monthOrNone(record.targetEndMonth),
  };
}

function writtenAt<Row>(rows: ReadonlyMap<string, Row>, place: string): Row {
  const found = rows.get(place);
  if (found === undefined) {
    throw new Error(`The copy wrote no row at ${place}, so nothing can be hung on it`);
  }

  return found;
}

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
    const { templateId } = body;
    if (templateId !== undefined && body.withDefaultCategories) {
      throw refuseBudget('TEMPLATE_WITH_DEFAULTS');
    }

    const language = toLanguage(body.language);

    return this.namingOnce(() =>
      this.mutations.run(
        {
          key: body.idempotencyKey,
          request: {
            language: body.language,
            name: body.name,
            currency: body.currency,
            timezone: body.timezone,
            withDefaultCategories: body.withDefaultCategories,
            ...(templateId === undefined ? {} : { templateId }),
          },
          decode: decodeBudget,
        },
        async (tx) => {
          await this.holdBudgets(tx);
          await this.nameFree(tx, body.name, null);
          const template = templateId === undefined ? null : await this.template(tx, templateId);
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

          if (template !== null) {
            await this.writeCopy(tx, userId, budget, template);
          }

          return serialize(budget);
        },
      ),
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
    return this.namingOnce(() =>
      this.mutations.run(
        {
          key: body.idempotencyKey,
          request: { id, name: body.name },
          decode: decodeBudget,
        },
        async (tx) => {
          await this.holdBudgets(tx);
          await this.ownedBudget(tx, id);
          await this.nameFree(tx, body.name, id);

          return serialize(await tx.budget.update({ where: { id }, data: { name: body.name } }));
        },
      ),
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

  private async namingOnce(write: () => Promise<BudgetResponse>): Promise<BudgetResponse> {
    try {
      return await write();
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002' &&
        JSON.stringify(error.meta ?? {}).includes(NAME_INDEX)
      ) {
        throw refuseBudget('NAME_TAKEN');
      }

      throw error;
    }
  }

  private async nameFree(tx: MutationClient, name: string, except: string | null): Promise<void> {
    const taken = await this.raw.query<{ id: string }>(
      (scope) => budgetNamedStatement(scope, name, except),
      tx,
    );
    if (taken.length > 0) {
      throw refuseBudget('NAME_TAKEN');
    }
  }

  private async holdBudgets(tx: MutationClient): Promise<void> {
    await this.raw.query<{ held: number }>((scope) => budgetsGateStatement(scope), tx);
    await this.raw.query<{ id: string }>((scope) => budgetsLockStatement(scope), tx);
  }

  private async ownedBudget(
    tx: MutationClient,
    id: string,
    refuse: () => Error = refuseMissingBudget,
  ): Promise<Budget> {
    const budget = await tx.budget.findFirst({ where: { id } });
    if (!budget) {
      throw refuse();
    }

    return budget;
  }

  private async template(tx: MutationClient, id: string): Promise<Template> {
    const budget = await this.ownedBudget(tx, id, () => refuseBudget('UNKNOWN_BUDGET'));
    const tree = await this.raw.query<CategoryTreeRecord>(
      (scope) => categoryTreeStatement(scope, id),
      tx,
    );

    return {
      budget,
      tree: tree.map(treeRow),
      accounts: await this.raw.query<OpenAccountRecord>(
        (scope) => openAccountsStatement(scope, id),
        tx,
      ),
      assets: await this.raw.query<NetWorthItemRecord>((scope) => assetsStatement(scope, id), tx),
      liabilities: await this.raw.query<NetWorthItemRecord>(
        (scope) => liabilitiesStatement(scope, id),
        tx,
      ),
    };
  }

  private async writeCopy(
    tx: MutationClient,
    userId: string,
    budget: Budget,
    template: Template,
  ): Promise<void> {
    const budgetId = budget.id;
    const createdOn = calendarDateIn(budget.createdAt, budget.timezone);
    const tree = copiedTree(template.tree, {
      month: monthOf(createdOn),
      withGoals: goalsComeAlong(template.budget, budget),
    });

    if (tree.length > 0) {
      await this.writeTree(tx, userId, budgetId, tree);
    }

    if (template.accounts.length > 0) {
      const accounts = await tx.account.createManyAndReturn({
        data: template.accounts.map(({ name, type }) => ({ userId, budgetId, name, type })),
        select: { id: true },
      });
      await tx.transaction.createMany({
        data: accounts.map((account) => ({
          userId,
          budgetId,
          accountId: account.id,
          date: toDbDate(createdOn),
          amount: 0n,
          type: TransactionType.INCOME,
          isSystem: true,
        })),
      });
    }

    if (template.assets.length > 0) {
      await tx.asset.createMany({
        data: template.assets.map(({ name }) => ({ userId, budgetId, name, amount: 0n })),
      });
    }

    if (template.liabilities.length > 0) {
      await tx.liability.createMany({
        data: template.liabilities.map(({ name }) => ({ userId, budgetId, name, amount: 0n })),
      });
    }
  }

  private async writeTree(
    tx: MutationClient,
    userId: string,
    budgetId: string,
    tree: ReturnType<typeof copiedTree>,
  ): Promise<void> {
    const groups = await tx.categoryGroup.createManyAndReturn({
      data: tree.map(({ name, sortOrder }) => ({ userId, budgetId, name, sortOrder })),
      select: { id: true, sortOrder: true },
    });
    const groupIds = new Map(groups.map((group) => [String(group.sortOrder), group.id]));

    const placed = tree.flatMap((group) =>
      group.categories.map((category) => ({
        groupId: writtenAt(groupIds, String(group.sortOrder)),
        category,
      })),
    );
    if (placed.length === 0) {
      return;
    }

    const categories = await tx.category.createManyAndReturn({
      data: placed.map(({ groupId, category }) => ({
        userId,
        budgetId,
        groupId,
        name: category.name,
        sortOrder: category.sortOrder,
        icon: category.icon,
        color: category.color,
      })),
      select: { id: true, groupId: true, sortOrder: true },
    });
    const categoryIds = new Map(
      categories.map((category) => [`${category.groupId}:${category.sortOrder}`, category.id]),
    );

    const goals = placed.flatMap(({ groupId, category }) =>
      category.goal === null
        ? []
        : [
            {
              userId,
              budgetId,
              categoryId: writtenAt(categoryIds, `${groupId}:${category.sortOrder}`),
              kind: category.goal.kind,
              amount: category.goal.amount,
              startMonth: toDbMonth(category.goal.startMonth),
              dueMonth: category.goal.dueMonth === null ? null : toDbMonth(category.goal.dueMonth),
            },
          ],
    );
    if (goals.length > 0) {
      await tx.categoryTarget.createMany({ data: goals });
    }
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
