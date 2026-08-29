import request from 'supertest';

import { startCategoryHarness, type CategoryHarness } from './category-harness';

const PREFIX = 'user_2rondoCatCrud';

const user = (name: string): string => `${PREFIX}${name}`;

describe('/categories and /category-groups (integration)', () => {
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

  it('writes a group and a category into the active budget, and the month shows them', async () => {
    const userId = user('Create');
    await harness.seedBudget(userId);

    const group = await post(userId, '/category-groups', {
      name: 'Дом',
      idempotencyKey: 'create-group',
    }).expect(201);

    await post(userId, '/categories', {
      groupId: (group.body as { id: string }).id,
      name: 'Аренда',
      icon: 'home',
      color: 'blue',
      idempotencyKey: 'create-category',
    }).expect(201);

    const view = await harness.viewOf(userId, '2026-02');

    expect(view.groups.map((one) => one.name)).toEqual(['Дом']);
    expect(view.groups[0]?.categories).toMatchObject([
      { name: 'Аренда', icon: 'home', color: 'blue' },
    ]);
  });

  it('renames a category, moves it to another group and repaints it', async () => {
    const userId = user('Edit');
    const budget = await harness.seedBudget(userId);
    const home = await harness.seedGroup(userId, budget.id, 'Дом', 0);
    const fun = await harness.seedGroup(userId, budget.id, 'Досуг', 1);
    const category = await harness.seedCategory(userId, budget.id, home.id, 'Аренда');

    await patch(userId, `/categories/${category.id}`, {
      name: 'Квартира',
      groupId: fun.id,
      icon: 'sofa',
      color: 'brown',
      idempotencyKey: 'edit-category',
    }).expect(200);

    const view = await harness.viewOf(userId, '2026-02');
    const moved = view.groups.find((one) => one.id === fun.id);

    expect(moved?.categories).toMatchObject([{ name: 'Квартира', icon: 'sofa', color: 'brown' }]);
    expect(view.groups.find((one) => one.id === home.id)?.categories).toEqual([]);
  });

  it('writes once when the same intent arrives twice under one key', async () => {
    const userId = user('Repeat');
    const budget = await harness.seedBudget(userId);
    const group = await harness.seedGroup(userId, budget.id, 'Дом');

    const body = { groupId: group.id, name: 'Аренда', idempotencyKey: 'twice' };
    const first = await post(userId, '/categories', body).expect(201);
    const second = await post(userId, '/categories', body).expect(201);

    expect(second.body).toEqual(first.body);
    expect(await harness.prisma.category.count({ where: { userId } })).toBe(1);
  });

  it('refuses a different intent wearing a used key rather than replaying the first', async () => {
    const userId = user('Conflict');
    const budget = await harness.seedBudget(userId);
    const group = await harness.seedGroup(userId, budget.id, 'Дом');

    await post(userId, '/categories', {
      groupId: group.id,
      name: 'Аренда',
      idempotencyKey: 'shared',
    }).expect(201);

    await post(userId, '/categories', {
      groupId: group.id,
      name: 'Еда',
      idempotencyKey: 'shared',
    }).expect(409);

    expect(await harness.prisma.category.count({ where: { userId } })).toBe(1);
  });

  it('refuses an icon or a colour outside the sets, and writes nothing', async () => {
    const userId = user('Look');
    const budget = await harness.seedBudget(userId);
    const group = await harness.seedGroup(userId, budget.id, 'Дом');

    await post(userId, '/categories', {
      groupId: group.id,
      name: 'Аренда',
      icon: 'unicorn',
      idempotencyKey: 'bad-icon',
    }).expect(400);

    await post(userId, '/categories', {
      groupId: group.id,
      name: 'Аренда',
      color: 'chartreuse',
      idempotencyKey: 'bad-color',
    }).expect(400);

    await post(userId, '/categories', {
      groupId: group.id,
      name: 'Аренда',
      icon: null,
      idempotencyKey: 'null-icon',
    }).expect(400);

    expect(await harness.prisma.category.count({ where: { userId } })).toBe(0);
  });

  it('serves no route that deletes a category or a group', async () => {
    const userId = user('NoDelete');
    const budget = await harness.seedBudget(userId);
    const group = await harness.seedGroup(userId, budget.id, 'Дом');
    const category = await harness.seedCategory(userId, budget.id, group.id, 'Аренда');

    const token = `Bearer ${harness.tokenFor(userId)}`;

    await request(harness.server())
      .delete(`/categories/${category.id}`)
      .set('Authorization', token)
      .expect(404);
    await request(harness.server())
      .delete(`/category-groups/${group.id}`)
      .set('Authorization', token)
      .expect(404);

    expect(await harness.prisma.category.count({ where: { userId } })).toBe(1);
    expect(await harness.prisma.categoryGroup.count({ where: { userId } })).toBe(1);
  });

  it('rewrites the whole order of a group in one call, and the month reads it back', async () => {
    const userId = user('Order');
    const budget = await harness.seedBudget(userId);
    const group = await harness.seedGroup(userId, budget.id, 'Дом');
    const first = await harness.seedCategory(userId, budget.id, group.id, 'Аренда', 0);
    const second = await harness.seedCategory(userId, budget.id, group.id, 'Свет', 1);
    const third = await harness.seedCategory(userId, budget.id, group.id, 'Вода', 2);

    await post(userId, '/categories/reorder', {
      groupId: group.id,
      categoryIds: [third.id, first.id, second.id],
      idempotencyKey: 'reorder',
    }).expect(201);

    const view = await harness.viewOf(userId, '2026-02');

    expect(view.groups[0]?.categories.map((one) => one.name)).toEqual(['Вода', 'Аренда', 'Свет']);
  });

  it('reorders a group that holds a hidden category, which the month never lists', async () => {
    const userId = user('OrderWithHidden');
    const budget = await harness.seedBudget(userId);
    const group = await harness.seedGroup(userId, budget.id, 'Дом');
    const first = await harness.seedCategory(userId, budget.id, group.id, 'Аренда', 0);
    const second = await harness.seedCategory(userId, budget.id, group.id, 'Свет', 1);
    const gone = await harness.seedCategory(
      userId,
      budget.id,
      group.id,
      'Такси',
      2,
      new Date('2026-01-05T12:00:00Z'),
    );

    await post(userId, '/categories/reorder', {
      groupId: group.id,
      categoryIds: [second.id, first.id],
      idempotencyKey: 'reorder-visible',
    }).expect(201);

    const view = await harness.viewOf(userId, '2026-02');

    expect(view.groups[0]?.categories.map((one) => one.name)).toEqual(['Свет', 'Аренда']);
    expect(
      (await harness.prisma.category.findUniqueOrThrow({ where: { id: gone.id } })).sortOrder,
    ).toBe(2);
  });

  it('refuses a reordering that is not a permutation of the group, and moves nothing', async () => {
    const userId = user('BadOrder');
    const budget = await harness.seedBudget(userId);
    const group = await harness.seedGroup(userId, budget.id, 'Дом');
    const first = await harness.seedCategory(userId, budget.id, group.id, 'Аренда', 0);
    const second = await harness.seedCategory(userId, budget.id, group.id, 'Свет', 1);

    await post(userId, '/categories/reorder', {
      groupId: group.id,
      categoryIds: [first.id, first.id],
      idempotencyKey: 'duplicate',
    }).expect(400);

    await post(userId, '/categories/reorder', {
      groupId: group.id,
      categoryIds: [second.id, '0199c1a8-9ecf-71c7-a617-c575df073799'],
      idempotencyKey: 'a-stranger',
    }).expect(400);

    const rows = await harness.prisma.category.findMany({
      where: { userId },
      orderBy: { sortOrder: 'asc' },
    });

    expect(rows.map((one) => one.id)).toEqual([first.id, second.id]);
  });

  it('rewrites the order of the groups themselves the same way', async () => {
    const userId = user('GroupOrder');
    const budget = await harness.seedBudget(userId);
    const home = await harness.seedGroup(userId, budget.id, 'Дом', 0);
    const fun = await harness.seedGroup(userId, budget.id, 'Досуг', 1);

    await post(userId, '/category-groups/reorder', {
      groupIds: [fun.id, home.id],
      idempotencyKey: 'reorder-groups',
    }).expect(201);

    const view = await harness.viewOf(userId, '2026-02');

    expect(view.groups.map((one) => one.name)).toEqual(['Досуг', 'Дом']);
  });

  it('renames a group', async () => {
    const userId = user('GroupRename');
    const budget = await harness.seedBudget(userId);
    const group = await harness.seedGroup(userId, budget.id, 'Дом');

    await patch(userId, `/category-groups/${group.id}`, {
      name: 'Обязательные платежи',
      idempotencyKey: 'rename-group',
    }).expect(200);

    const view = await harness.viewOf(userId, '2026-02');

    expect(view.groups.map((one) => one.name)).toEqual(['Обязательные платежи']);
  });
});
