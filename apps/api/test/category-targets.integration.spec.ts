import { monthOf, nextCalendarMonth, previousCalendarMonth, todayIn } from '@rondo/types';
import request from 'supertest';

import { startCategoryHarness, type CategoryHarness } from './category-harness';

const PREFIX = 'user_2rondoTargetsAaaaaaaaa';
const OWNER = `${PREFIX}_owner`;
const ZONE = 'Europe/Warsaw';

describe('the goal of a category', () => {
  let harness: CategoryHarness;

  const thisMonth = (): string => monthOf(todayIn(ZONE));

  const setTarget = (userId: string, categoryId: string, body: Record<string, unknown>) =>
    request(harness.server())
      .post(`/categories/${categoryId}/target`)
      .set('Authorization', `Bearer ${harness.tokenFor(userId)}`)
      .send(body);

  const closeTarget = (userId: string, categoryId: string, idempotencyKey: string) =>
    request(harness.server())
      .post(`/categories/${categoryId}/target/close`)
      .set('Authorization', `Bearer ${harness.tokenFor(userId)}`)
      .send({ idempotencyKey });

  const seedCategory = async (userId: string, zone = ZONE) => {
    const budget = await harness.seedBudget(userId, { timezone: zone });
    const group = await harness.seedGroup(userId, budget.id, 'Каждый месяц');
    const category = await harness.seedCategory(userId, budget.id, group.id, 'Продукты');

    return { budget, group, category };
  };

  const targetsOf = (categoryId: string) =>
    harness.prisma.categoryTarget.findMany({
      where: { categoryId },
      orderBy: { startMonth: 'asc' },
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

  it('is created by the first request, starting in the month the budget is living in', async () => {
    const { category } = await seedCategory(OWNER);

    const answer = await setTarget(OWNER, category.id, {
      kind: 'CONTRIBUTE',
      amount: '40000',
      idempotencyKey: 'set-first',
    }).expect(201);

    expect(answer.body).toMatchObject({
      kind: 'CONTRIBUTE',
      amount: '40000',
      startMonth: thisMonth(),
    });
    expect(await targetsOf(category.id)).toHaveLength(1);
  });

  it('is edited in place, and the edit moves neither the starting month nor the starting amount', async () => {
    const { budget, category } = await seedCategory(OWNER);
    await harness.seedAssignment(
      OWNER,
      budget.id,
      category.id,
      previousCalendarMonth(thisMonth()),
      7000n,
    );
    await setTarget(OWNER, category.id, {
      kind: 'BY_DATE',
      amount: '100000',
      dueMonth: nextCalendarMonth(nextCalendarMonth(thisMonth())),
      idempotencyKey: 'set-before-edit',
    }).expect(201);

    const [before] = await targetsOf(category.id);

    await setTarget(OWNER, category.id, {
      kind: 'BY_DATE',
      amount: '120000',
      dueMonth: nextCalendarMonth(nextCalendarMonth(thisMonth())),
      idempotencyKey: 'edit-amount',
    }).expect(201);

    const rows = await targetsOf(category.id);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(before?.id);
    expect(rows[0]?.amount).toBe(120000n);
    expect(rows[0]?.startMonth).toEqual(before?.startMonth);
  });

  it('takes its starting month from the budget zone rather than from the server clock', async () => {
    const ahead = `${PREFIX}_ahead`;
    const behind = `${PREFIX}_behind`;
    const first = await seedCategory(ahead, 'Pacific/Kiritimati');
    const second = await seedCategory(behind, 'Pacific/Niue');

    const one = await setTarget(ahead, first.category.id, {
      kind: 'CONTRIBUTE',
      amount: '1000',
      idempotencyKey: 'zone-ahead',
    }).expect(201);
    const other = await setTarget(behind, second.category.id, {
      kind: 'CONTRIBUTE',
      amount: '1000',
      idempotencyKey: 'zone-behind',
    }).expect(201);

    expect(one.body).toMatchObject({ startMonth: monthOf(todayIn('Pacific/Kiritimati')) });
    expect(other.body).toMatchObject({ startMonth: monthOf(todayIn('Pacific/Niue')) });
  });

  it('starts a new row and closes the old one when the kind changes on a goal from an earlier month', async () => {
    const { budget, category } = await seedCategory(OWNER);
    const started = previousCalendarMonth(previousCalendarMonth(thisMonth()));
    await harness.seedTarget(OWNER, budget.id, category.id, {
      kind: 'CONTRIBUTE',
      amount: 40000n,
      startMonth: started,
    });

    await setTarget(OWNER, category.id, {
      kind: 'ACCUMULATE',
      amount: '300000',
      idempotencyKey: 'change-kind',
    }).expect(201);

    const rows = await targetsOf(category.id);

    expect(rows).toHaveLength(2);
    expect(rows[0]?.kind).toBe('CONTRIBUTE');
    expect(rows[0]?.endMonth).toEqual(
      new Date(`${previousCalendarMonth(thisMonth())}-01T00:00:00Z`),
    );
    expect(rows[1]?.kind).toBe('ACCUMULATE');
    expect(rows[1]?.startMonth).toEqual(new Date(`${thisMonth()}-01T00:00:00Z`));
  });

  it('replaces the row when the kind changes on a goal started this month', async () => {
    const { category } = await seedCategory(OWNER);
    await setTarget(OWNER, category.id, {
      kind: 'CONTRIBUTE',
      amount: '40000',
      idempotencyKey: 'kind-before',
    }).expect(201);

    await setTarget(OWNER, category.id, {
      kind: 'ACCUMULATE',
      amount: '300000',
      idempotencyKey: 'kind-after',
    }).expect(201);

    const rows = await targetsOf(category.id);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.kind).toBe('ACCUMULATE');
    expect(rows[0]?.endMonth).toBeNull();
  });

  it('is closed with the month it was closed in, and the row stays', async () => {
    const { budget, category } = await seedCategory(OWNER);
    await harness.seedTarget(OWNER, budget.id, category.id, {
      kind: 'CONTRIBUTE',
      amount: 40000n,
      startMonth: previousCalendarMonth(thisMonth()),
    });

    await closeTarget(OWNER, category.id, 'close-it').expect(201);

    const rows = await targetsOf(category.id);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.endMonth).toEqual(new Date(`${thisMonth()}-01T00:00:00Z`));
  });

  it('gets a second row when a goal from an earlier month was closed this month', async () => {
    const { budget, category } = await seedCategory(OWNER);
    await harness.seedTarget(OWNER, budget.id, category.id, {
      kind: 'CONTRIBUTE',
      amount: 40000n,
      startMonth: previousCalendarMonth(thisMonth()),
      endMonth: thisMonth(),
    });

    await setTarget(OWNER, category.id, {
      kind: 'CONTRIBUTE',
      amount: '50000',
      idempotencyKey: 'after-close',
    }).expect(201);

    const rows = await targetsOf(category.id);

    expect(rows).toHaveLength(2);
    expect(rows[0]?.endMonth).toEqual(new Date(`${thisMonth()}-01T00:00:00Z`));
    expect(rows[1]?.amount).toBe(50000n);
    expect(rows[1]?.endMonth).toBeNull();
  });

  it('reuses the row when the goal closed this month also started this month', async () => {
    const { budget, category } = await seedCategory(OWNER);
    await harness.seedTarget(OWNER, budget.id, category.id, {
      kind: 'CONTRIBUTE',
      amount: 40000n,
      startMonth: thisMonth(),
      endMonth: thisMonth(),
    });

    await setTarget(OWNER, category.id, {
      kind: 'CONTRIBUTE',
      amount: '50000',
      idempotencyKey: 'reuse-row',
    }).expect(201);

    const rows = await targetsOf(category.id);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.amount).toBe(50000n);
    expect(rows[0]?.endMonth).toBeNull();
  });

  it('answers a repeated key with the first result and writes nothing twice', async () => {
    const { category } = await seedCategory(OWNER);
    const body = { kind: 'CONTRIBUTE', amount: '40000', idempotencyKey: 'repeat-me' };

    const first = await setTarget(OWNER, category.id, body).expect(201);
    const again = await setTarget(OWNER, category.id, body).expect(201);

    expect(again.body).toEqual(first.body);
    expect(await targetsOf(category.id)).toHaveLength(1);
  });

  it('applies one key sent twice at once exactly once', async () => {
    const { category } = await seedCategory(OWNER);
    const body = { kind: 'CONTRIBUTE', amount: '40000', idempotencyKey: 'race-one-key' };

    const answers = await Promise.all([
      setTarget(OWNER, category.id, body),
      setTarget(OWNER, category.id, body),
    ]);

    expect(answers.map((one) => one.status)).toEqual([201, 201]);
    expect(await targetsOf(category.id)).toHaveLength(1);
  });

  it('leaves one goal behind when two different keys arrive at once', async () => {
    const { category } = await seedCategory(OWNER);

    const answers = await Promise.all([
      setTarget(OWNER, category.id, {
        kind: 'CONTRIBUTE',
        amount: '40000',
        idempotencyKey: 'race-a',
      }),
      setTarget(OWNER, category.id, {
        kind: 'CONTRIBUTE',
        amount: '50000',
        idempotencyKey: 'race-b',
      }),
    ]);

    expect(answers.map((one) => one.status).sort()).toEqual([201, 201]);
    expect(await targetsOf(category.id)).toHaveLength(1);
  });

  it('refuses a key that was claimed by a different request', async () => {
    const { category } = await seedCategory(OWNER);
    await setTarget(OWNER, category.id, {
      kind: 'CONTRIBUTE',
      amount: '40000',
      idempotencyKey: 'same-key',
    }).expect(201);

    await setTarget(OWNER, category.id, {
      kind: 'CONTRIBUTE',
      amount: '90000',
      idempotencyKey: 'same-key',
    }).expect(409);
  });

  it('refuses every write on a hidden category', async () => {
    const { budget, group } = await seedCategory(OWNER);
    const hidden = await harness.seedCategory(
      OWNER,
      budget.id,
      group.id,
      'Скрытая',
      1,
      new Date('2020-01-01T00:00:00Z'),
    );

    const refusal = await setTarget(OWNER, hidden.id, {
      kind: 'CONTRIBUTE',
      amount: '40000',
      idempotencyKey: 'hidden-set',
    }).expect(400);

    expect(refusal.body).toMatchObject({ reason: 'CATEGORY_HIDDEN' });

    await closeTarget(OWNER, hidden.id, 'hidden-close').expect(400);
  });

  it('refuses a due month the budget has already lived through', async () => {
    const { category } = await seedCategory(OWNER);

    const refusal = await setTarget(OWNER, category.id, {
      kind: 'BY_DATE',
      amount: '100000',
      dueMonth: previousCalendarMonth(thisMonth()),
      idempotencyKey: 'due-past',
    }).expect(400);

    expect(refusal.body).toMatchObject({ reason: 'DUE_MONTH_PAST' });
  });

  it('refuses a due month on a kind that has no date, and a missing one on the kind that needs it', async () => {
    const { category } = await seedCategory(OWNER);

    await setTarget(OWNER, category.id, {
      kind: 'CONTRIBUTE',
      amount: '40000',
      dueMonth: nextCalendarMonth(thisMonth()),
      idempotencyKey: 'due-not-allowed',
    }).expect(400);

    await setTarget(OWNER, category.id, {
      kind: 'BY_DATE',
      amount: '100000',
      idempotencyKey: 'due-missing',
    }).expect(400);
  });

  it('refuses an amount of nothing, a negative one and one sent as a number', async () => {
    const { category } = await seedCategory(OWNER);

    await setTarget(OWNER, category.id, {
      kind: 'CONTRIBUTE',
      amount: '0',
      idempotencyKey: 'amount-zero',
    }).expect(400);

    await setTarget(OWNER, category.id, {
      kind: 'CONTRIBUTE',
      amount: '-40000',
      idempotencyKey: 'amount-negative',
    }).expect(400);

    await setTarget(OWNER, category.id, {
      kind: 'CONTRIBUTE',
      amount: 40000,
      idempotencyKey: 'amount-number',
    }).expect(400);
  });

  it('refuses a closing when the category has no live goal', async () => {
    const { budget, category } = await seedCategory(OWNER);
    await harness.seedTarget(OWNER, budget.id, category.id, {
      kind: 'CONTRIBUTE',
      amount: 40000n,
      startMonth: previousCalendarMonth(previousCalendarMonth(thisMonth())),
      endMonth: previousCalendarMonth(thisMonth()),
    });

    const refusal = await closeTarget(OWNER, category.id, 'close-nothing').expect(400);

    expect(refusal.body).toMatchObject({ reason: 'NO_TARGET' });
  });

  it('answers a second closing in the same month without moving the month it was closed in', async () => {
    const { budget, category } = await seedCategory(OWNER);
    await harness.seedTarget(OWNER, budget.id, category.id, {
      kind: 'CONTRIBUTE',
      amount: 40000n,
      startMonth: previousCalendarMonth(thisMonth()),
    });

    await closeTarget(OWNER, category.id, 'close-once').expect(201);
    await closeTarget(OWNER, category.id, 'close-twice').expect(201);

    const rows = await targetsOf(category.id);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.endMonth).toEqual(new Date(`${thisMonth()}-01T00:00:00Z`));
  });

  it('refuses a category the active budget does not hold rather than failing on a key', async () => {
    const { category } = await seedCategory(OWNER);
    const other = await harness.seedBudget(OWNER, { active: false, name: 'Второй' });
    const otherGroup = await harness.seedGroup(OWNER, other.id, 'Другая группа');
    const elsewhere = await harness.seedCategory(OWNER, other.id, otherGroup.id, 'Чужая');

    const refusal = await setTarget(OWNER, elsewhere.id, {
      kind: 'CONTRIBUTE',
      amount: '40000',
      idempotencyKey: 'other-budget',
    }).expect(400);

    expect(refusal.body).toMatchObject({ reason: 'UNKNOWN_CATEGORY' });
    expect(await targetsOf(category.id)).toHaveLength(0);
  });
});

describe('what the database refuses about a goal', () => {
  let harness: CategoryHarness;

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

  const seeded = async () => {
    const budget = await harness.seedBudget(OWNER);
    const group = await harness.seedGroup(OWNER, budget.id, 'Каждый месяц');
    const category = await harness.seedCategory(OWNER, budget.id, group.id, 'Продукты');

    return { budget, group, category };
  };

  const row = (budgetId: string, categoryId: string, over: Record<string, unknown> = {}) => ({
    userId: OWNER,
    budgetId,
    categoryId,
    kind: 'CONTRIBUTE' as const,
    amount: 1000n,
    startMonth: new Date('2026-02-01T00:00:00Z'),
    ...over,
  });

  it.each([
    ['start_month', { startMonth: new Date('2026-02-15T00:00:00Z') }],
    ['due_month', { kind: 'BY_DATE' as const, dueMonth: new Date('2026-05-15T00:00:00Z') }],
    ['end_month', { endMonth: new Date('2026-03-15T00:00:00Z') }],
  ])('refuses a %s that is not the first day of its month', async (column, over) => {
    const { budget, category } = await seeded();

    await expect(
      harness.prisma.categoryTarget.create({ data: row(budget.id, category.id, over) }),
    ).rejects.toThrow(new RegExp(`category_target_${column}_is_first_of_month`));
  });

  it('refuses an amount of nothing', async () => {
    const { budget, category } = await seeded();

    await expect(
      harness.prisma.categoryTarget.create({
        data: row(budget.id, category.id, { amount: 0n }),
      }),
    ).rejects.toThrow(/category_target_amount_is_positive/);
  });

  it('refuses a second goal starting in the same month', async () => {
    const { budget, category } = await seeded();
    await harness.prisma.categoryTarget.create({ data: row(budget.id, category.id) });

    await expect(
      harness.prisma.categoryTarget.create({
        data: row(budget.id, category.id, { amount: 2000n }),
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('refuses a goal naming a budget somebody else owns', async () => {
    const { category } = await seeded();
    const stranger = await harness.seedBudget(`${PREFIX}_stranger`);

    await expect(
      harness.prisma.categoryTarget.create({ data: row(stranger.id, category.id) }),
    ).rejects.toThrow();
  });

  it('refuses a goal naming a category from another budget', async () => {
    const { budget } = await seeded();
    const other = await harness.seedBudget(OWNER, { active: false, name: 'Второй' });
    const otherGroup = await harness.seedGroup(OWNER, other.id, 'Другая группа');
    const elsewhere = await harness.seedCategory(OWNER, other.id, otherGroup.id, 'Чужая');

    await expect(
      harness.prisma.categoryTarget.create({ data: row(budget.id, elsewhere.id) }),
    ).rejects.toThrow();
  });

  it('refuses deleting a category a goal still names', async () => {
    const { budget, category } = await seeded();
    await harness.prisma.categoryTarget.create({ data: row(budget.id, category.id) });

    await expect(harness.prisma.category.delete({ where: { id: category.id } })).rejects.toThrow();
  });
});
