import request from 'supertest';

import { categoryAvailableStatement } from '@/categories/category-available.query';

import { startCategoryHarness, type CategoryHarness } from './category-harness';

const PREFIX = 'user_2rondoOwners';

const OWNER = `${PREFIX}Owner`;
const STRANGER = `${PREFIX}Stranger`;

describe('categories belong to one caller (integration)', () => {
  let harness: CategoryHarness;

  let ownerGroup: { id: string };
  let ownerCategory: { id: string };

  beforeAll(async () => {
    harness = await startCategoryHarness(PREFIX);
  });

  afterAll(async () => {
    await harness.removeFixtures();
    await harness.close();
  });

  beforeEach(async () => {
    await harness.removeFixtures();

    const ownerBudget = await harness.seedBudget(OWNER);
    ownerGroup = await harness.seedGroup(OWNER, ownerBudget.id, 'Дом');
    ownerCategory = await harness.seedCategory(OWNER, ownerBudget.id, ownerGroup.id, 'Аренда');

    const strangerBudget = await harness.seedBudget(STRANGER);
    const strangerGroup = await harness.seedGroup(STRANGER, strangerBudget.id, 'Чужое');
    const strangerCategory = await harness.seedCategory(
      STRANGER,
      strangerBudget.id,
      strangerGroup.id,
      'Чужая',
    );

    await harness.seedAssignment(
      STRANGER,
      strangerBudget.id,
      strangerCategory.id,
      '2026-02',
      90_000n,
    );
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

  it('does not show one caller the groups and categories of another', async () => {
    const view = await harness.viewOf(STRANGER, '2026-02');

    expect(view.groups.map((one) => one.name)).toEqual(['Чужое']);
  });

  it('refuses every write a stranger aims at a category that is not theirs', async () => {
    await patch(STRANGER, `/categories/${ownerCategory.id}`, {
      name: 'Перехвачено',
      idempotencyKey: 'steal-rename',
    }).expect(400);

    await post(STRANGER, `/categories/${ownerCategory.id}/hide`, {
      idempotencyKey: 'steal-hide',
    }).expect(400);

    await post(STRANGER, `/categories/${ownerCategory.id}/unhide`, {
      idempotencyKey: 'steal-unhide',
    }).expect(400);

    await post(STRANGER, '/categories/reorder', {
      groupId: ownerGroup.id,
      categoryIds: [ownerCategory.id],
      idempotencyKey: 'steal-order',
    }).expect(400);

    const row = await harness.prisma.category.findUniqueOrThrow({
      where: { id: ownerCategory.id },
    });

    expect(row).toMatchObject({ name: 'Аренда', userId: OWNER, hiddenAt: null });
  });

  it('refuses every write a stranger aims at a group that is not theirs', async () => {
    await patch(STRANGER, `/category-groups/${ownerGroup.id}`, {
      name: 'Перехвачено',
      idempotencyKey: 'steal-group-rename',
    }).expect(400);

    await post(STRANGER, `/category-groups/${ownerGroup.id}/hide`, {
      idempotencyKey: 'steal-group-hide',
    }).expect(400);

    const row = await harness.prisma.categoryGroup.findUniqueOrThrow({
      where: { id: ownerGroup.id },
    });

    expect(row).toMatchObject({ name: 'Дом', userId: OWNER, hiddenAt: null });
  });

  it('hides the owner category although a stranger holds money in a category shaped like it', async () => {
    await post(OWNER, `/categories/${ownerCategory.id}/hide`, {
      idempotencyKey: 'own-hide',
    }).expect(201);
  });

  it('binds the caller into the aggregate, so a dropped predicate would change the answer', () => {
    const statement = categoryAvailableStatement({ userId: OWNER }, 'b', [ownerCategory.id]);

    expect(statement.values).toContain(OWNER);
    expect(statement.text).not.toContain(OWNER);
  });
});
