import {
  monthOf,
  nextCalendarMonth,
  parseMoney,
  previousCalendarMonth,
  todayIn,
} from '@rondo/types';
import request from 'supertest';

import { startCategoryHarness, type CategoryHarness, type View } from './category-harness';

const PREFIX = 'user_2rondoPaidAaaaaaaaaaaaa';
const OWNER = `${PREFIX}_owner`;
const ZONE = 'Europe/Warsaw';

describe('the paid mark of a category', () => {
  let harness: CategoryHarness;

  const thisMonth = (): string => monthOf(todayIn(ZONE));

  const mark = (userId: string, categoryId: string, body: Record<string, unknown>) =>
    request(harness.server())
      .post(`/categories/${categoryId}/paid`)
      .set('Authorization', `Bearer ${harness.tokenFor(userId)}`)
      .send(body);

  const unmark = (userId: string, categoryId: string, body: Record<string, unknown>) =>
    request(harness.server())
      .post(`/categories/${categoryId}/unpaid`)
      .set('Authorization', `Bearer ${harness.tokenFor(userId)}`)
      .send(body);

  const seedCategory = async (userId: string) => {
    const budget = await harness.seedBudget(userId);
    const group = await harness.seedGroup(userId, budget.id, 'Обязательные');
    const category = await harness.seedCategory(userId, budget.id, group.id, 'Аренда');
    const account = await harness.seedAccount(userId, budget.id);

    return { budget, group, category, account };
  };

  const marksOf = (categoryId: string) =>
    harness.prisma.categoryPaidMonth.findMany({ where: { categoryId }, orderBy: { month: 'asc' } });

  const sums = (view: View): { pool: bigint; available: bigint } => ({
    pool: parseMoney(view.readyToAssign),
    available: view.groups
      .flatMap((group) => group.categories)
      .reduce((total, one) => total + parseMoney(one.available), 0n),
  });

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

  it('is put on the pair of category and month, and the month view reports it', async () => {
    const { category } = await seedCategory(OWNER);

    const answer = await mark(OWNER, category.id, {
      month: thisMonth(),
      idempotencyKey: 'mark-first',
    }).expect(201);

    expect(answer.body).toEqual({ categoryId: category.id, month: thisMonth(), paid: true });
    expect(await marksOf(category.id)).toHaveLength(1);

    const view = await harness.viewOf(OWNER, thisMonth());
    expect(view.groups[0]?.categories[0]).toMatchObject({ id: category.id, paid: true });
  });

  it('is gone in the next month without any action, and absent in the one before', async () => {
    const { category } = await seedCategory(OWNER);
    await mark(OWNER, category.id, { month: thisMonth(), idempotencyKey: 'mark-this' }).expect(201);

    const next = await harness.viewOf(OWNER, nextCalendarMonth(thisMonth()));
    const before = await harness.viewOf(OWNER, previousCalendarMonth(thisMonth()));

    expect(next.groups[0]?.categories[0]).toMatchObject({ id: category.id, paid: false });
    expect(before.groups[0]?.categories[0]).toMatchObject({ id: category.id, paid: false });
  });

  it('can be put on a month other than the one the budget is living in', async () => {
    const { category } = await seedCategory(OWNER);
    const earlier = previousCalendarMonth(thisMonth());

    await mark(OWNER, category.id, { month: earlier, idempotencyKey: 'mark-earlier' }).expect(201);

    const view = await harness.viewOf(OWNER, earlier);
    expect(view.groups[0]?.categories[0]).toMatchObject({ paid: true });
    expect((await harness.viewOf(OWNER, thisMonth())).groups[0]?.categories[0]).toMatchObject({
      paid: false,
    });
  });

  it('is taken off again, and taking it off twice is not a refusal', async () => {
    const { category } = await seedCategory(OWNER);
    await mark(OWNER, category.id, { month: thisMonth(), idempotencyKey: 'mark' }).expect(201);

    const first = await unmark(OWNER, category.id, {
      month: thisMonth(),
      idempotencyKey: 'unmark-1',
    }).expect(201);
    const second = await unmark(OWNER, category.id, {
      month: thisMonth(),
      idempotencyKey: 'unmark-2',
    }).expect(201);

    expect(first.body).toEqual({ categoryId: category.id, month: thisMonth(), paid: false });
    expect(second.body).toEqual(first.body);
    expect(await marksOf(category.id)).toHaveLength(0);
  });

  it('is not put on twice when marked twice, whatever key the second request carries', async () => {
    const { category } = await seedCategory(OWNER);

    await mark(OWNER, category.id, { month: thisMonth(), idempotencyKey: 'mark-a' }).expect(201);
    await mark(OWNER, category.id, { month: thisMonth(), idempotencyKey: 'mark-b' }).expect(201);

    expect(await marksOf(category.id)).toHaveLength(1);
  });

  it('answers a repeated key with the first result rather than running again', async () => {
    const { category } = await seedCategory(OWNER);

    const first = await mark(OWNER, category.id, {
      month: thisMonth(),
      idempotencyKey: 'repeat',
    }).expect(201);
    await unmark(OWNER, category.id, { month: thisMonth(), idempotencyKey: 'between' }).expect(201);
    const replayed = await mark(OWNER, category.id, {
      month: thisMonth(),
      idempotencyKey: 'repeat',
    }).expect(201);

    expect(replayed.body).toEqual(first.body);
    expect(await marksOf(category.id)).toHaveLength(0);
  });

  it('refuses a key claimed for a different month', async () => {
    const { category } = await seedCategory(OWNER);

    await mark(OWNER, category.id, { month: thisMonth(), idempotencyKey: 'one-key' }).expect(201);
    await mark(OWNER, category.id, {
      month: nextCalendarMonth(thisMonth()),
      idempotencyKey: 'one-key',
    }).expect(409);
  });

  it('changes no amount: ready to assign and every available are what they were', async () => {
    const { budget, category, account } = await seedCategory(OWNER);
    const month = thisMonth();
    await harness.seedIncome(OWNER, budget.id, account.id, `${month}-02`, 100_000n);
    await harness.seedAssignment(OWNER, budget.id, category.id, month, 40_000n);
    await harness.seedExpense(OWNER, budget.id, account.id, category.id, `${month}-03`, -15_000n);

    const before = sums(await harness.viewOf(OWNER, month));
    await mark(OWNER, category.id, { month, idempotencyKey: 'no-money' }).expect(201);
    const after = sums(await harness.viewOf(OWNER, month));

    expect(after).toEqual(before);
    expect(after.pool + after.available).toBe(100_000n - 15_000n);
  });

  it('refuses a month that is not a calendar month, and a hidden category', async () => {
    const { budget, group, category } = await seedCategory(OWNER);
    const hidden = await harness.seedCategory(OWNER, budget.id, group.id, 'Старая', 1, new Date());

    await mark(OWNER, category.id, { month: '2026-13', idempotencyKey: 'bad-month' }).expect(400);
    await mark(OWNER, category.id, { month: '2026-02-01', idempotencyKey: 'a-date' }).expect(400);

    const refused = await mark(OWNER, hidden.id, {
      month: thisMonth(),
      idempotencyKey: 'hidden',
    }).expect(400);
    expect(refused.body).toMatchObject({ reason: 'CATEGORY_HIDDEN' });
    expect(await marksOf(category.id)).toHaveLength(0);
  });

  it('refuses a month that is not the first day of its month, at the table itself', async () => {
    const { budget, category } = await seedCategory(OWNER);

    await expect(
      harness.prisma.categoryPaidMonth.create({
        data: {
          userId: OWNER,
          budgetId: budget.id,
          categoryId: category.id,
          month: new Date('2026-03-15T00:00:00Z'),
        },
      }),
    ).rejects.toThrow(/category_paid_month_month_is_first_of_month/);
  });

  it('refuses a category this budget does not hold', async () => {
    await seedCategory(OWNER);

    const refused = await mark(OWNER, '0199c1a8-9ecf-71c7-a617-c575df073700', {
      month: thisMonth(),
      idempotencyKey: 'unknown',
    }).expect(400);

    expect(refused.body).toMatchObject({ reason: 'UNKNOWN_CATEGORY' });
  });
});
