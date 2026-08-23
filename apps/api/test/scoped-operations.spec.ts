import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@rondo/db';

import { withUserScoping } from '@/prisma/user-scoping.extension';
import { RequestContextService } from '@/request-context/request-context.service';

const USER = 'user_a';
const BUDGET = 'budget_a';
const PAYLOAD_BUDGET = 'budget_named_by_the_caller';
const OTHER = 'user_b';

interface Captured {
  operation: string;
  args: {
    where?: Record<string, unknown>;
    data?: unknown;
    create?: Record<string, unknown>;
    update?: Record<string, unknown>;
  };
}

const noActiveBudget = (): Promise<undefined> => Promise.resolve(undefined);

describe('every operation the extension claims to handle', () => {
  const context = new RequestContextService();
  const client = new PrismaClient({
    adapter: new PrismaPg({ connectionString: 'postgresql://unused:unused@127.0.0.1:1/unused' }),
  });

  const captured: Captured[] = [];
  const scoped = withUserScoping(client, context, noActiveBudget).$extends({
    query: {
      $allModels: {
        $allOperations({ operation, args }) {
          captured.push({ operation, args });
          return Promise.resolve(null);
        },
      },
    },
  });

  afterAll(async () => {
    await client.$disconnect();
  });

  const row = {
    userId: OTHER,
    budgetId: PAYLOAD_BUDGET,
    groupId: 'g1',
    name: 'Food',
    sortOrder: 0,
  };

  const reaching = (operation: string): Captured['args'] => {
    const hit = captured.find((entry) => entry.operation === operation);
    if (!hit) {
      throw new Error(
        `"${operation}" never reached the driver, so the extension refused it. Either it lost ` +
          'its rule or it is missing from HANDLED_OPERATIONS.',
      );
    }

    return hit.args;
  };

  beforeAll(async () => {
    await context.run(async () => {
      context.setUserId(USER);
      context.setBudgetId(BUDGET);

      await scoped.category.findMany({});
      await scoped.category.findFirst({});
      await scoped.category.findFirstOrThrow({});
      await scoped.category.findUnique({ where: { id: 'c1' } });
      await scoped.category.findUniqueOrThrow({ where: { id: 'c1' } });
      await scoped.category.count({});
      await context.runInMutation(async () => {
        await scoped.category.create({ data: row });
        await scoped.category.createMany({ data: [row] });
        await scoped.category.createManyAndReturn({ data: [row] });
        await scoped.category.update({ where: { id: 'c1' }, data: { userId: OTHER } });
        await scoped.category.updateMany({ where: { name: 'Food' }, data: { userId: OTHER } });
        await scoped.category.updateManyAndReturn({
          where: { name: 'Food' },
          data: { userId: OTHER },
        });
        await scoped.category.upsert({
          where: { id: 'c1' },
          create: row,
          update: { userId: OTHER },
        });
        await scoped.category.delete({ where: { id: 'c1' } });
        await scoped.category.deleteMany({});
      });
    });
  });

  const READS = [
    'findMany',
    'findFirst',
    'findFirstOrThrow',
    'findUnique',
    'findUniqueOrThrow',
    'count',
  ];

  const BUDGET_CONFINED_WRITES = [
    'update',
    'updateMany',
    'updateManyAndReturn',
    'delete',
    'deleteMany',
  ];

  it.each(READS)('filters %s by the caller and the active budget', (operation) => {
    expect(reaching(operation).where).toMatchObject({ userId: USER, budgetId: BUDGET });
  });

  it.each(BUDGET_CONFINED_WRITES)(
    'confines %s to the caller and to the active budget, since it names no budget itself',
    (operation) => {
      expect(reaching(operation).where).toMatchObject({ userId: USER, budgetId: BUDGET });
    },
  );

  it('confines the row an upsert picks out to the active budget', () => {
    const { where, create } = reaching('upsert');

    expect(where).toMatchObject({ userId: USER, budgetId: BUDGET });
    expect(create).toMatchObject({ userId: USER, budgetId: PAYLOAD_BUDGET });
  });

  it.each(['create', 'update', 'updateMany', 'updateManyAndReturn'])(
    'stamps the caller onto the payload of %s, over whoever it named',
    (operation) => {
      expect(reaching(operation).data).toMatchObject({ userId: USER });
    },
  );

  it.each(['createMany', 'createManyAndReturn'])('stamps every row of %s', (operation) => {
    expect(reaching(operation).data).toEqual([expect.objectContaining({ userId: USER })]);
  });

  it('stamps all three halves of an upsert, so neither branch can hand a row away', () => {
    const args = reaching('upsert');

    expect(args.where).toMatchObject({ userId: USER });
    expect(args.create).toMatchObject({ userId: USER });
    expect(args.update).toMatchObject({ userId: USER });
  });

  it('keeps the budget the payload named rather than stamping the active one', () => {
    expect(reaching('create').data).toMatchObject({ budgetId: PAYLOAD_BUDGET, userId: USER });
  });
});
