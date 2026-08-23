import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@rondo/db';

import { withUserScoping } from '@/prisma/user-scoping.extension';
import { RequestContextService } from '@/request-context/request-context.service';

const USER = 'user_a';
const BUDGET = 'budget_a';

interface Captured {
  operation: string;
  args: { where?: Record<string, unknown> };
}

describe('resolving the active budget only when a query needs it', () => {
  const context = new RequestContextService();
  const client = new PrismaClient({
    adapter: new PrismaPg({ connectionString: 'postgresql://unused:unused@127.0.0.1:1/unused' }),
  });

  const resolveActiveBudget = jest.fn<Promise<string | undefined>, [string]>();
  const captured: Captured[] = [];

  const scoped = withUserScoping(client, context, resolveActiveBudget).$extends({
    query: {
      $allModels: {
        $allOperations({ operation, args }) {
          captured.push({ operation, args: args as Captured['args'] });
          return Promise.resolve(null);
        },
      },
    },
  });

  afterAll(async () => {
    await client.$disconnect();
  });

  beforeEach(() => {
    captured.length = 0;
    resolveActiveBudget.mockReset();
    resolveActiveBudget.mockResolvedValue(BUDGET);
  });

  const asUser = <T>(work: () => Promise<T>): Promise<T> =>
    context.run(async () => {
      context.setUserId(USER);
      return await work();
    });

  it('resolves on the first read that needs a budget, and the query carries it', async () => {
    await asUser(() => scoped.category.findMany());

    expect(resolveActiveBudget).toHaveBeenCalledWith(USER);
    expect(captured[0]?.args.where).toEqual({ userId: USER, budgetId: BUDGET });
  });

  it('resolves once per request, however many reads follow', async () => {
    await asUser(async () => {
      await scoped.category.findMany();
      await scoped.account.findMany();
      await scoped.transaction.count();
    });

    expect(resolveActiveBudget).toHaveBeenCalledTimes(1);
    expect(captured.map((entry) => entry.args.where?.budgetId)).toEqual([BUDGET, BUDGET, BUDGET]);
  });

  it('resolves once when two reads of one request run side by side', async () => {
    await asUser(() => Promise.all([scoped.category.findMany(), scoped.account.findMany()]));

    expect(resolveActiveBudget).toHaveBeenCalledTimes(1);
    expect(captured.map((entry) => entry.args.where?.budgetId)).toEqual([BUDGET, BUDGET]);
  });

  it('refuses the read when the caller has no active budget', async () => {
    resolveActiveBudget.mockResolvedValue(undefined);

    await asUser(async () => {
      await expect(scoped.category.findMany()).rejects.toThrow(/no active budget/);
    });

    expect(captured).toEqual([]);
  });

  it('asks again after an absence, so a budget created mid-request is found', async () => {
    resolveActiveBudget.mockResolvedValueOnce(undefined).mockResolvedValue(BUDGET);

    await asUser(async () => {
      await expect(scoped.category.findMany()).rejects.toThrow(/no active budget/);
      await scoped.category.findMany();
    });

    expect(resolveActiveBudget).toHaveBeenCalledTimes(2);
    expect(captured[0]?.args.where).toEqual({ userId: USER, budgetId: BUDGET });
  });

  it('never asks for a budget on a model the user owns directly', async () => {
    await asUser(() => scoped.userSettings.findUnique({ where: { userId: USER } }));

    expect(resolveActiveBudget).not.toHaveBeenCalled();
  });

  it('never asks for a budget on a write that only creates rows', async () => {
    await asUser(() =>
      context.runInMutation(async () => {
        await scoped.categoryGroup.create({
          data: { userId: USER, budgetId: BUDGET, name: 'Living', sortOrder: 0 },
        });
        await scoped.categoryGroup.createMany({
          data: [{ userId: USER, budgetId: BUDGET, name: 'Bills', sortOrder: 1 }],
        });
      }),
    );

    expect(resolveActiveBudget).not.toHaveBeenCalled();
    expect(captured).toHaveLength(2);
  });

  it('asks for a budget on an upsert, whose where picks out an existing row', async () => {
    await asUser(() =>
      context.runInMutation(() =>
        scoped.categoryGroup.upsert({
          where: { id: 'g1' },
          create: { userId: USER, budgetId: BUDGET, name: 'Fun', sortOrder: 2 },
          update: { name: 'Fun' },
        }),
      ),
    );

    expect(resolveActiveBudget).toHaveBeenCalledWith(USER);
    expect(captured[0]?.args.where).toMatchObject({ userId: USER, budgetId: BUDGET });
  });
});
