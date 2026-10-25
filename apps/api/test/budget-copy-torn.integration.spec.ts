import { type TestingModuleBuilder } from '@nestjs/testing';
import request from 'supertest';

import { ACTIVE_BUDGET_RESOLVER, type ActiveBudgetResolver } from '@/prisma/active-budget.resolver';
import { PrismaService } from '@/prisma/prisma.service';
import { MUTATOR_PRISMA } from '@/prisma/scoped-prisma';
import { withUserScoping } from '@/prisma/user-scoping.extension';
import { RequestContextService } from '@/request-context/request-context.service';

import { COPY_ZONE, rowsOf, seedLiveGoal, seedOpened, seedTemplate } from './budget-copy-fixture';
import { startCategoryHarness, type CategoryHarness } from './category-harness';

const PREFIX = 'user_2rondoTornCopy';

const USER = `${PREFIX}Owner`;

const WRITTEN_MODELS = [
  'CategoryGroup',
  'Category',
  'Account',
  'Transaction',
  'Asset',
  'Liability',
  'CategoryTarget',
] as const;

let failOn: string | null = null;
let refused = 0;
let operations = 0;

const tornMutator = (builder: TestingModuleBuilder): TestingModuleBuilder =>
  builder.overrideProvider(MUTATOR_PRISMA).useFactory({
    inject: [PrismaService, RequestContextService, ACTIVE_BUDGET_RESOLVER],
    factory: (
      service: PrismaService,
      context: RequestContextService,
      resolveActiveBudget: ActiveBudgetResolver,
    ) =>
      withUserScoping(service, context, resolveActiveBudget).$extends({
        query: {
          $allModels: {
            $allOperations({ model, operation, args, query }) {
              operations += 1;

              if (model === failOn && operation.startsWith('create')) {
                refused += 1;
                throw new Error(`the write to ${model} failed on purpose`);
              }

              return query(args);
            },
          },
        },
      }),
  });

describe('POST /budgets with a budget to start from, when a write fails part way through', () => {
  let harness: CategoryHarness;

  beforeAll(async () => {
    harness = await startCategoryHarness(PREFIX, { customise: tornMutator });
  });

  afterAll(async () => {
    await harness.removeFixtures();
    await harness.close();
  });

  beforeEach(async () => {
    await harness.removeFixtures();
    failOn = null;
    refused = 0;
    operations = 0;
  });

  const copy = (userId: string, templateId: string, over: Record<string, unknown> = {}) =>
    request(harness.server())
      .post('/budgets')
      .set('Authorization', `Bearer ${harness.tokenFor(userId)}`)
      .send({
        language: 'en',
        name: 'Копия',
        currency: 'PLN',
        timezone: COPY_ZONE,
        withDefaultCategories: false,
        templateId,
        idempotencyKey: 'torn',
        ...over,
      });

  const seedEveryTable = async (userId: string) => {
    const seeded = await seedTemplate(harness, userId);
    await seedLiveGoal(harness, userId, seeded.budget.id, seeded.housing.id);
    await harness.prisma.userSettings.create({ data: { userId, language: 'RU' } });

    return seeded.budget;
  };

  it.each(WRITTEN_MODELS)(
    'leaves nothing of the copy when the write to %s fails, and keeps the original active',
    async (model) => {
      const budget = await seedEveryTable(USER);
      const before = await rowsOf(harness, USER);
      failOn = model;

      const response = await copy(USER, budget.id);

      expect(response.status).toBe(500);
      expect(refused).toBe(1);
      await expect(rowsOf(harness, USER)).resolves.toEqual(before);
      await expect(harness.prisma.idempotencyKey.count({ where: { userId: USER } })).resolves.toBe(
        0,
      );
      await expect(
        harness.prisma.budget.findUniqueOrThrow({ where: { id: budget.id } }),
      ).resolves.toMatchObject({ active: true });
      await expect(
        harness.prisma.userSettings.findUniqueOrThrow({ where: { userId: USER } }),
      ).resolves.toMatchObject({ language: 'RU' });
    },
  );

  it('issues the same number of operations for a budget of many rows as for a budget of one of each, so a large one fits the same window', async () => {
    const seedSized = async (
      userId: string,
      size: { groups: number; perGroup: number; rest: number },
    ) => {
      const budget = await harness.seedBudget(userId, { name: 'Исходный' });
      for (let groupIndex = 0; groupIndex < size.groups; groupIndex += 1) {
        const group = await harness.seedGroup(
          userId,
          budget.id,
          `Группа ${groupIndex}`,
          groupIndex,
        );
        for (let index = 0; index < size.perGroup; index += 1) {
          const category = await harness.seedCategory(
            userId,
            budget.id,
            group.id,
            `Категория ${index}`,
            index,
          );
          if (groupIndex === 0 && index < size.rest) {
            await seedLiveGoal(harness, userId, budget.id, category.id);
          }
        }
      }
      for (let index = 0; index < size.rest; index += 1) {
        await seedOpened(harness, userId, budget.id, `Счёт ${index}`, 0n);
        await harness.seedAsset(userId, budget.id, { name: `Актив ${index}`, amount: 1n });
        await harness.seedLiability(userId, budget.id, { name: `Пассив ${index}`, amount: 1n });
      }

      return budget;
    };
    const small = await seedSized(`${PREFIX}Small`, { groups: 1, perGroup: 1, rest: 1 });
    const large = await seedSized(`${PREFIX}Large`, { groups: 4, perGroup: 10, rest: 5 });

    const first = await copy(`${PREFIX}Small`, small.id);
    const forOne = operations;
    operations = 0;
    const second = await copy(`${PREFIX}Large`, large.id);
    const forMany = operations;

    expect([first.status, second.status]).toEqual([201, 201]);
    await expect(rowsOf(harness, `${PREFIX}Large`)).resolves.toMatchObject({
      categories: 80,
      targets: 10,
      accounts: 10,
      transactions: 10,
      assets: 10,
      liabilities: 10,
    });
    expect(forMany).toBe(forOne);
  });
});
