import { Controller, Get, Param } from '@nestjs/common';
import { type Prisma } from '@rondo/db';
import request from 'supertest';

import {
  assetsStatement,
  categoryTreeStatement,
  liabilitiesStatement,
  openAccountsStatement,
} from '@/budgets/budget-structure.query';
import { type RawQueryScope, ScopedRawRepository } from '@/raw-sql/scoped-raw.repository';

import { COPY_ZONE, rowsOf, seedLiveGoal, seedTemplate } from './budget-copy-fixture';
import { startCategoryHarness, type CategoryHarness } from './category-harness';

const PREFIX = 'user_2rondoScopeCopy';

const USER_A = `${PREFIX}TenantA`;
const USER_B = `${PREFIX}TenantB`;

const UNKNOWN_ID = '0199c1a8-9ecf-71c7-a617-c575df0739ff';

const STATEMENTS: Record<string, (scope: RawQueryScope, budgetId: string) => Prisma.Sql> = {
  tree: categoryTreeStatement,
  accounts: openAccountsStatement,
  assets: assetsStatement,
  liabilities: liabilitiesStatement,
};

@Controller('test-budget-structure')
class BudgetStructureProbeController {
  constructor(private readonly repository: ScopedRawRepository) {}

  @Get(':budgetId/:statement')
  async read(
    @Param('budgetId') budgetId: string,
    @Param('statement') statement: string,
  ): Promise<{ rows: number }> {
    const build = STATEMENTS[statement];
    if (!build) {
      throw new Error(`The probe knows no statement called ${statement}`);
    }

    const rows = await this.repository.query<unknown>((scope) => build(scope, budgetId));

    return { rows: rows.length };
  }
}

describe('starting a budget from another one, across tenants (integration)', () => {
  let harness: CategoryHarness;

  beforeAll(async () => {
    harness = await startCategoryHarness(PREFIX, {
      controllers: [BudgetStructureProbeController],
    });
  });

  afterAll(async () => {
    await harness.removeFixtures();
    await harness.close();
  });

  beforeEach(async () => {
    await harness.removeFixtures();
  });

  const copy = (userId: string, templateId: string, over: Record<string, unknown> = {}) =>
    request(harness.server())
      .post('/budgets')
      .set('Authorization', `Bearer ${harness.tokenFor(userId)}`)
      .send({
        language: 'ru',
        name: 'Копия',
        currency: 'PLN',
        timezone: COPY_ZONE,
        withDefaultCategories: false,
        templateId,
        idempotencyKey: 'copy',
        ...over,
      });

  const probe = async (userId: string, budgetId: string, statement: string): Promise<number> => {
    const response = await request(harness.server())
      .get(`/test-budget-structure/${budgetId}/${statement}`)
      .set('Authorization', `Bearer ${harness.tokenFor(userId)}`)
      .expect(200);

    return (response.body as { rows: number }).rows;
  };

  const activeNamesOf = async (userId: string): Promise<string[]> =>
    (await harness.prisma.budget.findMany({ where: { userId, active: true } })).map(
      (budget) => budget.name,
    );

  it('answers another tenant’s budget exactly as it answers one nobody has, and writes nothing', async () => {
    const theirs = await seedTemplate(harness, USER_A);
    await harness.seedBudget(USER_B, { name: 'Свой' });
    const before = { a: await rowsOf(harness, USER_A), b: await rowsOf(harness, USER_B) };

    const foreign = await copy(USER_B, theirs.budget.id, { idempotencyKey: 'foreign' });
    const unknown = await copy(USER_B, UNKNOWN_ID, { idempotencyKey: 'unknown' });

    expect(foreign.status).toBe(400);
    expect((foreign.body as { reason?: string }).reason).toBe('UNKNOWN_BUDGET');
    expect(foreign.body).toEqual(unknown.body);
    await expect(rowsOf(harness, USER_A)).resolves.toEqual(before.a);
    await expect(rowsOf(harness, USER_B)).resolves.toEqual(before.b);
    await expect(harness.prisma.idempotencyKey.count({ where: { userId: USER_B } })).resolves.toBe(
      0,
    );
    await expect(activeNamesOf(USER_B)).resolves.toEqual(['Свой']);
    await expect(activeNamesOf(USER_A)).resolves.toEqual(['Исходный']);
  });

  it('gives each tenant their own copy when both send the same key', async () => {
    const first = await seedTemplate(harness, USER_A);
    const second = await harness.seedBudget(USER_B, { name: 'Свой' });
    const group = await harness.seedGroup(USER_B, second.id, 'Только у второго');
    await harness.seedCategory(USER_B, second.id, group.id, 'Его категория');

    const a = await copy(USER_A, first.budget.id, { name: 'Копия первого' });
    const b = await copy(USER_B, second.id, { name: 'Копия второго' });

    expect([a.status, b.status]).toEqual([201, 201]);
    const copied = b.body as { id: string; name: string };
    expect(copied.name).toBe('Копия второго');
    await expect(
      harness.prisma.category.findMany({ where: { budgetId: copied.id }, select: { name: true } }),
    ).resolves.toEqual([{ name: 'Его категория' }]);
    await expect(
      harness.prisma.budget.findUniqueOrThrow({ where: { id: copied.id } }),
    ).resolves.toMatchObject({ userId: USER_B });
  });

  it.each(Object.keys(STATEMENTS))(
    'reads the %s rows for their owner and none for another tenant naming the same budget',
    async (statement) => {
      const theirs = await seedTemplate(harness, USER_A);
      await seedLiveGoal(harness, USER_A, theirs.budget.id, theirs.housing.id);
      await harness.seedBudget(USER_B, { name: 'Свой' });

      const owner = await probe(USER_A, theirs.budget.id, statement);
      const stranger = await probe(USER_B, theirs.budget.id, statement);

      expect(owner).toBeGreaterThan(0);
      expect(stranger).toBe(0);
    },
  );
});
