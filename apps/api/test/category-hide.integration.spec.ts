import request from 'supertest';

import { startCategoryHarness, type CategoryHarness } from './category-harness';

const PREFIX = 'user_2rondoVanishing';

const user = (name: string): string => `${PREFIX}${name}`;

describe('hiding a category and a group (integration)', () => {
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

  const post = (userId: string, path: string, body: Record<string, unknown>) =>
    request(harness.server())
      .post(path)
      .set('Authorization', `Bearer ${harness.tokenFor(userId)}`)
      .send(body);

  const patch = (userId: string, path: string, body: Record<string, unknown>) =>
    request(harness.server())
      .patch(path)
      .set('Authorization', `Bearer ${harness.tokenFor(userId)}`)
      .send(body);

  it('hides a category that holds nothing, and leaves its history where it was', async () => {
    const userId = user('Empty');
    const budget = await harness.seedBudget(userId);
    const account = await harness.seedAccount(userId, budget.id);
    const group = await harness.seedGroup(userId, budget.id, 'Дом');
    const category = await harness.seedCategory(userId, budget.id, group.id, 'Такси');

    await harness.seedIncome(userId, budget.id, account.id, '2026-02-01', 100_000n);
    await harness.seedAssignment(userId, budget.id, category.id, '2026-02', 5_000n);
    await harness.seedExpense(userId, budget.id, account.id, category.id, '2026-02-10', -5_000n);

    await post(userId, `/categories/${category.id}/hide`, { idempotencyKey: 'hide' }).expect(201);

    const row = await harness.prisma.category.findUniqueOrThrow({ where: { id: category.id } });

    expect(row.hiddenAt).not.toBeNull();
    expect(await harness.prisma.transaction.count({ where: { categoryId: category.id } })).toBe(1);
    expect(await harness.prisma.assignment.count({ where: { categoryId: category.id } })).toBe(1);
  });

  it('refuses a category still holding money, and says why', async () => {
    const userId = user('Positive');
    const budget = await harness.seedBudget(userId);
    const group = await harness.seedGroup(userId, budget.id, 'Дом');
    const category = await harness.seedCategory(userId, budget.id, group.id, 'Отпуск');

    await harness.seedAssignment(userId, budget.id, category.id, '2026-02', 40_000n);

    const refused = await post(userId, `/categories/${category.id}/hide`, {
      idempotencyKey: 'hide-positive',
    }).expect(400);

    expect(refused.body).toMatchObject({ reason: 'AVAILABLE_NOT_ZERO', available: '40000' });
    expect(
      (await harness.prisma.category.findUniqueOrThrow({ where: { id: category.id } })).hiddenAt,
    ).toBeNull();
  });

  it('refuses a category that is overspent, because a hidden debt is the same lost envelope', async () => {
    const userId = user('Negative');
    const budget = await harness.seedBudget(userId);
    const account = await harness.seedAccount(userId, budget.id);
    const group = await harness.seedGroup(userId, budget.id, 'Дом');
    const category = await harness.seedCategory(userId, budget.id, group.id, 'Ремонт');

    await harness.seedExpense(userId, budget.id, account.id, category.id, '2026-02-10', -3_000n);

    const refused = await post(userId, `/categories/${category.id}/hide`, {
      idempotencyKey: 'hide-negative',
    }).expect(400);

    expect(refused.body).toMatchObject({ reason: 'AVAILABLE_NOT_ZERO', available: '-3000' });
  });

  it('refuses a category that reads zero this month and holds money in a later one', async () => {
    const userId = user('Future');
    const budget = await harness.seedBudget(userId);
    const group = await harness.seedGroup(userId, budget.id, 'Дом');
    const category = await harness.seedCategory(userId, budget.id, group.id, 'Отпуск');

    await harness.seedAssignment(userId, budget.id, category.id, '2026-09', 40_000n);

    expect((await harness.viewOf(userId, '2026-02')).groups[0]?.categories[0]).toMatchObject({
      available: '0',
      availableAllTime: '40000',
    });

    await post(userId, `/categories/${category.id}/hide`, {
      idempotencyKey: 'hide-future',
    }).expect(400);
  });

  it('lets the hide through once the remainder has been moved out, in two calls', async () => {
    const userId = user('AfterMove');
    const budget = await harness.seedBudget(userId);
    const group = await harness.seedGroup(userId, budget.id, 'Дом');
    const category = await harness.seedCategory(userId, budget.id, group.id, 'Отпуск');

    await harness.seedAssignment(userId, budget.id, category.id, '2026-09', 40_000n);

    await post(userId, `/categories/${category.id}/hide`, {
      idempotencyKey: 'too-early',
    }).expect(400);

    await post(userId, '/moves', {
      month: '2026-09',
      amount: '40000',
      from: { kind: 'CATEGORY', categoryId: category.id },
      to: { kind: 'READY_TO_ASSIGN' },
      idempotencyKey: 'take-it-out',
    }).expect(201);

    await post(userId, `/categories/${category.id}/hide`, {
      idempotencyKey: 'now-empty',
    }).expect(201);
  });

  it('refuses to hide a category that is already hidden, so its marker never moves', async () => {
    const userId = user('Twice');
    const budget = await harness.seedBudget(userId);
    const group = await harness.seedGroup(userId, budget.id, 'Дом');
    const category = await harness.seedCategory(
      userId,
      budget.id,
      group.id,
      'Такси',
      0,
      new Date('2026-01-15T12:00:00Z'),
    );

    const refused = await post(userId, `/categories/${category.id}/hide`, {
      idempotencyKey: 'again',
    }).expect(400);

    expect(refused.body).toMatchObject({ reason: 'ALREADY_HIDDEN' });
    expect(
      (
        await harness.prisma.category.findUniqueOrThrow({ where: { id: category.id } })
      ).hiddenAt?.toISOString(),
    ).toBe('2026-01-15T12:00:00.000Z');
  });

  it('refuses to hide a group that is already hidden, so its categories keep their way back', async () => {
    const userId = user('GroupTwice');
    const budget = await harness.seedBudget(userId);
    const group = await harness.seedGroup(
      userId,
      budget.id,
      'Стройка',
      0,
      new Date('2026-01-05T12:00:00Z'),
    );
    const inside = await harness.seedCategory(
      userId,
      budget.id,
      group.id,
      'Материалы',
      0,
      new Date('2026-01-05T12:00:00Z'),
    );

    const refused = await post(userId, `/category-groups/${group.id}/hide`, {
      idempotencyKey: 'again',
    }).expect(400);

    expect(refused.body).toMatchObject({ reason: 'ALREADY_HIDDEN' });

    await post(userId, `/category-groups/${group.id}/unhide`, {
      idempotencyKey: 'back',
    }).expect(201);

    expect(
      (await harness.prisma.category.findUniqueOrThrow({ where: { id: inside.id } })).hiddenAt,
    ).toBeNull();
  });

  it('brings a category back when the marker is taken off', async () => {
    const userId = user('Unhide');
    const budget = await harness.seedBudget(userId);
    const group = await harness.seedGroup(userId, budget.id, 'Дом');
    const category = await harness.seedCategory(
      userId,
      budget.id,
      group.id,
      'Такси',
      0,
      new Date('2026-02-10T12:00:00Z'),
    );

    expect((await harness.viewOf(userId, '2026-02')).groups[0]?.categories).toEqual([]);

    await post(userId, `/categories/${category.id}/unhide`, { idempotencyKey: 'back' }).expect(201);

    expect((await harness.viewOf(userId, '2026-02')).groups[0]?.categories).toMatchObject([
      { name: 'Такси' },
    ]);
  });

  it('keeps a hidden category out of the month without moving the money it assigned', async () => {
    const userId = user('StillCounted');
    const budget = await harness.seedBudget(userId);
    const account = await harness.seedAccount(userId, budget.id);
    const group = await harness.seedGroup(userId, budget.id, 'Дом');
    const category = await harness.seedCategory(userId, budget.id, group.id, 'Такси');

    await harness.seedIncome(userId, budget.id, account.id, '2026-02-01', 100_000n);
    await harness.seedAssignment(userId, budget.id, category.id, '2026-02', 30_000n);
    await harness.seedExpense(userId, budget.id, account.id, category.id, '2026-02-10', -30_000n);

    const before = await harness.viewOf(userId, '2026-02');

    await post(userId, `/categories/${category.id}/hide`, { idempotencyKey: 'hide' }).expect(201);

    const february = await harness.viewOf(userId, '2026-02');
    const afterwards = await harness.viewOf(userId, '2400-01');

    expect(february.readyToAssign).toBe(before.readyToAssign);
    expect(february.groups[0]?.categories.map((one) => one.name)).toEqual(['Такси']);

    expect(afterwards.readyToAssign).toBe(before.readyToAssign);
    expect(afterwards.groups[0]?.categories).toEqual([]);
  });

  it('hides a group with every category it holds, in one transaction', async () => {
    const userId = user('WholeGroup');
    const budget = await harness.seedBudget(userId);
    const group = await harness.seedGroup(userId, budget.id, 'Дом');
    const first = await harness.seedCategory(userId, budget.id, group.id, 'Аренда', 0);
    const second = await harness.seedCategory(userId, budget.id, group.id, 'Свет', 1);

    await post(userId, `/category-groups/${group.id}/hide`, {
      idempotencyKey: 'hide-group',
    }).expect(201);

    const rows = await harness.prisma.category.findMany({
      where: { id: { in: [first.id, second.id] } },
    });

    expect(rows.every((one) => one.hiddenAt !== null)).toBe(true);
    expect(
      (await harness.prisma.categoryGroup.findUniqueOrThrow({ where: { id: group.id } })).hiddenAt,
    ).not.toBeNull();
  });

  it('refuses the whole group when one of its categories still holds money', async () => {
    const userId = user('GroupNotEmpty');
    const budget = await harness.seedBudget(userId);
    const group = await harness.seedGroup(userId, budget.id, 'Дом');
    const empty = await harness.seedCategory(userId, budget.id, group.id, 'Аренда', 0);
    const full = await harness.seedCategory(userId, budget.id, group.id, 'Свет', 1);

    await harness.seedAssignment(userId, budget.id, full.id, '2026-02', 1_000n);

    const refused = await post(userId, `/category-groups/${group.id}/hide`, {
      idempotencyKey: 'hide-group',
    }).expect(400);

    expect(refused.body).toMatchObject({ reason: 'AVAILABLE_NOT_ZERO' });

    const rows = await harness.prisma.category.findMany({
      where: { id: { in: [empty.id, full.id] } },
    });

    expect(rows.every((one) => one.hiddenAt === null)).toBe(true);
    expect(
      (await harness.prisma.categoryGroup.findUniqueOrThrow({ where: { id: group.id } })).hiddenAt,
    ).toBeNull();
  });

  it('counts an already hidden category when it decides whether a group may go', async () => {
    const userId = user('GroupWithHidden');
    const budget = await harness.seedBudget(userId);
    const group = await harness.seedGroup(userId, budget.id, 'Дом');
    await harness.seedCategory(userId, budget.id, group.id, 'Аренда', 0);
    const hidden = await harness.seedCategory(
      userId,
      budget.id,
      group.id,
      'Свет',
      1,
      new Date('2026-01-05T12:00:00Z'),
    );

    await harness.seedAssignment(userId, budget.id, hidden.id, '2026-02', 1_000n);

    await post(userId, `/category-groups/${group.id}/hide`, {
      idempotencyKey: 'hide-group',
    }).expect(400);
  });

  it('leaves a category its own hidden marker when the group it sits in is hidden later', async () => {
    const userId = user('MarkerKept');
    const budget = await harness.seedBudget(userId);
    const group = await harness.seedGroup(userId, budget.id, 'Дом');
    const early = await harness.seedCategory(
      userId,
      budget.id,
      group.id,
      'Такси',
      0,
      new Date('2026-01-15T12:00:00Z'),
    );
    await harness.seedCategory(userId, budget.id, group.id, 'Аренда', 1);

    expect((await harness.viewOf(userId, '2026-02')).groups[0]?.categories).toMatchObject([
      { name: 'Аренда' },
    ]);

    await post(userId, `/category-groups/${group.id}/hide`, {
      idempotencyKey: 'hide-group',
    }).expect(201);

    const row = await harness.prisma.category.findUniqueOrThrow({ where: { id: early.id } });

    expect(row.hiddenAt?.toISOString()).toBe('2026-01-15T12:00:00.000Z');
    expect((await harness.viewOf(userId, '2026-02')).groups[0]?.categories).toMatchObject([
      { name: 'Аренда' },
    ]);
  });

  it('brings back only the categories the group took with it', async () => {
    const userId = user('BackTogether');
    const budget = await harness.seedBudget(userId);
    const group = await harness.seedGroup(userId, budget.id, 'Дом');
    const early = await harness.seedCategory(
      userId,
      budget.id,
      group.id,
      'Такси',
      0,
      new Date('2026-01-15T12:00:00Z'),
    );
    const withIt = await harness.seedCategory(userId, budget.id, group.id, 'Аренда', 1);

    await post(userId, `/category-groups/${group.id}/hide`, {
      idempotencyKey: 'hide-group',
    }).expect(201);
    await post(userId, `/category-groups/${group.id}/unhide`, {
      idempotencyKey: 'unhide-group',
    }).expect(201);

    const rows = await harness.prisma.category.findMany({
      where: { id: { in: [early.id, withIt.id] } },
    });

    expect(rows.find((one) => one.id === withIt.id)?.hiddenAt).toBeNull();
    expect(rows.find((one) => one.id === early.id)?.hiddenAt?.toISOString()).toBe(
      '2026-01-15T12:00:00.000Z',
    );
  });

  it('returns a hidden category and a hidden group when the caller asks for them', async () => {
    const userId = user('ShowHidden');
    const budget = await harness.seedBudget(userId);
    const visible = await harness.seedGroup(userId, budget.id, 'Дом', 0);
    const gone = await harness.seedGroup(
      userId,
      budget.id,
      'Стройка',
      1,
      new Date('2026-01-05T12:00:00Z'),
    );

    await harness.seedCategory(userId, budget.id, visible.id, 'Аренда', 0);
    await harness.seedCategory(
      userId,
      budget.id,
      visible.id,
      'Такси',
      1,
      new Date('2026-01-05T12:00:00Z'),
    );
    await harness.seedCategory(userId, budget.id, gone.id, 'Материалы', 0);

    const closed = await harness.viewOf(userId, '2026-02');
    const open = await harness.viewOf(userId, '2026-02', true);

    expect(closed.groups.map((one) => one.name)).toEqual(['Дом']);
    expect(closed.groups[0]?.categories.map((one) => one.name)).toEqual(['Аренда']);

    expect(open.groups.map((one) => one.name)).toEqual(['Дом', 'Стройка']);
    expect(open.groups[0]?.categories.map((one) => one.name)).toEqual(['Аренда', 'Такси']);
  });

  it('refuses to move a category into a hidden group, so money cannot vanish with it', async () => {
    const userId = user('IntoHidden');
    const budget = await harness.seedBudget(userId);
    const home = await harness.seedGroup(userId, budget.id, 'Дом', 0);
    const gone = await harness.seedGroup(
      userId,
      budget.id,
      'Стройка',
      1,
      new Date('2026-01-05T12:00:00Z'),
    );
    const category = await harness.seedCategory(userId, budget.id, home.id, 'Отпуск');

    await harness.seedAssignment(userId, budget.id, category.id, '2026-02', 40_000n);

    const refused = await patch(userId, `/categories/${category.id}`, {
      groupId: gone.id,
      idempotencyKey: 'into-hidden',
    }).expect(400);

    expect(refused.body).toMatchObject({ reason: 'GROUP_HIDDEN' });
    expect(
      (await harness.prisma.category.findUniqueOrThrow({ where: { id: category.id } })).groupId,
    ).toBe(home.id);
  });

  it('refuses the same move when the group is hidden after it was created empty', async () => {
    const userId = user('HideThenMove');
    const budget = await harness.seedBudget(userId);
    const home = await harness.seedGroup(userId, budget.id, 'Дом', 0);
    const empty = await harness.seedGroup(userId, budget.id, 'Пусто', 1);
    const category = await harness.seedCategory(userId, budget.id, home.id, 'Отпуск');

    await harness.seedAssignment(userId, budget.id, category.id, '2026-02', 40_000n);

    await post(userId, `/category-groups/${empty.id}/hide`, {
      idempotencyKey: 'hide-empty-group',
    }).expect(201);

    await patch(userId, `/categories/${category.id}`, {
      groupId: empty.id,
      idempotencyKey: 'into-hidden-later',
    }).expect(400);

    const view = await harness.viewOf(userId, '2026-02');
    const total = view.groups
      .flatMap((one) => one.categories)
      .reduce((sum, one) => sum + BigInt(one.available), 0n);

    expect(total).toBe(40_000n);
  });
});
