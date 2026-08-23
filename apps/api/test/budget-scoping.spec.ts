import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@rondo/db';

import { withUserScoping } from '@/prisma/user-scoping.extension';
import { RequestContextService } from '@/request-context/request-context.service';

const USER = 'user_a';
const BUDGET = 'budget_a';

describe('budget scoping', () => {
  const context = new RequestContextService();
  const client = new PrismaClient({
    adapter: new PrismaPg({ connectionString: 'postgresql://unused:unused@127.0.0.1:1/unused' }),
  });
  const scoped = withUserScoping(client, context);

  afterAll(async () => {
    await client.$disconnect();
  });

  const asUser = <T>(query: () => Promise<T>): Promise<T> =>
    context.run(async () => {
      context.setUserId(USER);
      return await query();
    });

  const asUserOfBudget = <T>(query: () => Promise<T>): Promise<T> =>
    context.run(async () => {
      context.setUserId(USER);
      context.setBudgetId(BUDGET);
      return await query();
    });

  describe('with no active budget in the request', () => {
    it('refuses to read a budget-scoped model, naming it', async () => {
      await expect(asUser(() => scoped.category.findMany())).rejects.toThrow(
        /no active budget.*Category|Category.*no active budget/,
      );
    });

    it('refuses every kind of read the same way', async () => {
      await expect(asUser(() => scoped.transaction.count())).rejects.toThrow(/no active budget/);
      await expect(asUser(() => scoped.account.findFirst())).rejects.toThrow(/no active budget/);
      await expect(
        asUser(() => scoped.categoryGroup.findUnique({ where: { id: 'whatever' } })),
      ).rejects.toThrow(/no active budget/);
    });

    it('leaves the user-level models alone: they belong to no budget', async () => {
      await expect(asUser(() => scoped.budget.findMany())).rejects.toThrow(
        /reach database server|ECONNREFUSED/i,
      );
      await expect(asUser(() => scoped.idempotencyKey.findMany())).rejects.toThrow(
        /reach database server|ECONNREFUSED/i,
      );
    });
  });

  describe('with an active budget in the request', () => {
    it('refuses groupBy and aggregate until the caller scopes them itself', async () => {
      await expect(
        asUserOfBudget(() => scoped.transaction.groupBy({ by: ['categoryId'] })),
      ).rejects.toThrow(/Refusing "groupBy" on Transaction/);

      await expect(
        asUserOfBudget(() => scoped.transaction.aggregate({ _count: true })),
      ).rejects.toThrow(/has no scoping rule/);
    });

    it('accepts groupBy once it carries both the caller and the budget', async () => {
      await expect(
        asUserOfBudget(() =>
          scoped.transaction.groupBy({
            by: ['categoryId'],
            where: { userId: USER, budgetId: BUDGET },
          }),
        ),
      ).rejects.toThrow(/reach database server|ECONNREFUSED/i);
    });

    it('lets every write the extension has a rule for through to the driver', async () => {
      const reachesTheDriver = /reach database server|ECONNREFUSED/i;

      await expect(
        asUserOfBudget(() => scoped.category.update({ where: { id: 'c1' }, data: { name: 'x' } })),
      ).rejects.toThrow(reachesTheDriver);

      await expect(
        asUserOfBudget(() => scoped.category.delete({ where: { id: 'c1' } })),
      ).rejects.toThrow(reachesTheDriver);

      await expect(
        asUserOfBudget(() => scoped.transaction.updateMany({ data: { payee: 'x' } })),
      ).rejects.toThrow(reachesTheDriver);

      await expect(asUserOfBudget(() => scoped.account.deleteMany({}))).rejects.toThrow(
        reachesTheDriver,
      );

      await expect(
        asUserOfBudget(() =>
          scoped.categoryGroup.upsert({
            where: { id: 'g1' },
            create: { budgetId: BUDGET, name: 'Living', sortOrder: 0, userId: USER },
            update: {},
          }),
        ),
      ).rejects.toThrow(reachesTheDriver);
    });

    it('refuses a groupBy scoped to a budget that is not the active one', async () => {
      await expect(
        asUserOfBudget(() =>
          scoped.transaction.groupBy({
            by: ['categoryId'],
            where: { userId: USER, budgetId: 'budget_of_another_month' },
          }),
        ),
      ).rejects.toThrow(/has no scoping rule/);
    });

    it('still refuses a groupBy that names the caller but no budget', async () => {
      await expect(
        asUserOfBudget(() =>
          scoped.transaction.groupBy({ by: ['categoryId'], where: { userId: USER } }),
        ),
      ).rejects.toThrow(/has no scoping rule/);
    });
  });
});
