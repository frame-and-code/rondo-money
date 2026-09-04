import { monthOf, todayIn } from '@rondo/types';
import request from 'supertest';

import { startCategoryHarness, type CategoryHarness } from './category-harness';

const PREFIX = 'user_2rondoPaidScope';
const USER_A = `${PREFIX}Aaaaaaaaaaaa`;
const USER_B = `${PREFIX}Bbbbbbbbbbbb`;
const ZONE = 'Europe/Warsaw';

describe('a paid mark keeps to one caller and one budget', () => {
  let harness: CategoryHarness;

  const thisMonth = (): string => monthOf(todayIn(ZONE));

  const seedFor = async (userId: string, name: string, paid: boolean, active = true) => {
    const budget = await harness.seedBudget(userId, { name: `Бюджет ${name}`, active });
    const group = await harness.seedGroup(userId, budget.id, `Группа ${name}`);
    const category = await harness.seedCategory(userId, budget.id, group.id, `Категория ${name}`);
    if (paid) {
      await harness.seedPaid(userId, budget.id, category.id, thisMonth());
    }

    return { budget, category };
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

  it("answers a caller with their own mark and never with the other one's", async () => {
    const mine = await seedFor(USER_A, 'A', false);
    await seedFor(USER_B, 'B', true);

    const view = await harness.viewOf(USER_A, thisMonth());
    const categories = view.groups.flatMap((group) => group.categories);

    expect(categories).toHaveLength(1);
    expect(categories[0]).toMatchObject({ id: mine.category.id, paid: false });
  });

  it('refuses to mark a category another caller owns, and writes nothing', async () => {
    const theirs = await seedFor(USER_B, 'B', false);
    await seedFor(USER_A, 'A', false);

    await request(harness.server())
      .post(`/categories/${theirs.category.id}/paid`)
      .set('Authorization', `Bearer ${harness.tokenFor(USER_A)}`)
      .send({ month: thisMonth(), idempotencyKey: 'cross-tenant' })
      .expect(400);

    expect(
      await harness.prisma.categoryPaidMonth.count({ where: { categoryId: theirs.category.id } }),
    ).toBe(0);
  });

  it("refuses to take another caller's mark off", async () => {
    const theirs = await seedFor(USER_B, 'B', true);
    await seedFor(USER_A, 'A', false);

    await request(harness.server())
      .post(`/categories/${theirs.category.id}/unpaid`)
      .set('Authorization', `Bearer ${harness.tokenFor(USER_A)}`)
      .send({ month: thisMonth(), idempotencyKey: 'cross-tenant-unmark' })
      .expect(400);

    expect(
      await harness.prisma.categoryPaidMonth.count({ where: { categoryId: theirs.category.id } }),
    ).toBe(1);
  });

  it('reads the mark of the active budget only, when the caller holds a second one', async () => {
    const active = await seedFor(USER_A, 'A', true);
    await seedFor(USER_A, 'Старый', true, false);

    const view = await harness.viewOf(USER_A, thisMonth());
    const categories = view.groups.flatMap((group) => group.categories);

    expect(categories).toHaveLength(1);
    expect(categories[0]).toMatchObject({ id: active.category.id, paid: true });
  });
});
