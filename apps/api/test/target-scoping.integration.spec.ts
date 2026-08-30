import { monthOf, previousCalendarMonth, todayIn } from '@rondo/types';
import request from 'supertest';

import { startCategoryHarness, type CategoryHarness } from './category-harness';

const PREFIX = 'user_2rondoTargetScope';
const USER_A = `${PREFIX}Aaaaaaaaaaaa`;
const USER_B = `${PREFIX}Bbbbbbbbbbbb`;
const ZONE = 'Europe/Warsaw';

describe('a goal keeps to one caller and one budget', () => {
  let harness: CategoryHarness;

  const thisMonth = (): string => monthOf(todayIn(ZONE));

  const seedFor = async (userId: string, name: string, amount: bigint, active = true) => {
    const budget = await harness.seedBudget(userId, { name: `Бюджет ${name}`, active });
    const group = await harness.seedGroup(userId, budget.id, `Группа ${name}`);
    const category = await harness.seedCategory(userId, budget.id, group.id, `Категория ${name}`);
    const target = await harness.seedTarget(userId, budget.id, category.id, {
      kind: 'CONTRIBUTE',
      amount,
      startMonth: previousCalendarMonth(thisMonth()),
    });

    return { budget, category, target };
  };

  beforeAll(async () => {
    harness = await startCategoryHarness(PREFIX);
  });

  afterAll(async () => {
    await harness.removeFixtures();
    await harness.close();
  });

  beforeEach(async () => {
    await harness.removeFixtures();
  });

  it("answers a caller with their own goal and never with the other one's", async () => {
    const mine = await seedFor(USER_A, 'A', 11_000n);
    await seedFor(USER_B, 'B', 22_000n);

    const view = await harness.viewOf(USER_A, thisMonth());
    const categories = view.groups.flatMap((group) => group.categories);

    expect(categories).toHaveLength(1);
    expect(categories[0]?.target).toMatchObject({ amount: '11000' });
    expect(categories[0]?.id).toBe(mine.category.id);
  });

  it('refuses to write a goal onto a category another caller owns', async () => {
    const theirs = await seedFor(USER_B, 'B', 22_000n);
    await seedFor(USER_A, 'A', 11_000n);

    await request(harness.server())
      .post(`/categories/${theirs.category.id}/target`)
      .set('Authorization', `Bearer ${harness.tokenFor(USER_A)}`)
      .send({ kind: 'CONTRIBUTE', amount: '99000', idempotencyKey: 'cross-tenant' })
      .expect(400);

    const untouched = await harness.prisma.categoryTarget.findUnique({
      where: { id: theirs.target.id },
    });

    expect(untouched?.amount).toBe(22_000n);
  });

  it('reads the goal of the active budget only, when the caller holds a second one', async () => {
    await seedFor(USER_A, 'A', 11_000n);
    await seedFor(USER_A, 'Старый', 99_000n, false);

    const view = await harness.viewOf(USER_A, thisMonth());
    const categories = view.groups.flatMap((group) => group.categories);

    expect(categories).toHaveLength(1);
    expect(categories[0]?.target).toMatchObject({ amount: '11000' });
  });
});
