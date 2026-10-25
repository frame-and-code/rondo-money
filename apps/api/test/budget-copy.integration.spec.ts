import { monthOf, nextCalendarMonth, previousCalendarMonth, todayIn } from '@rondo/types';
import request from 'supertest';

import {
  COPY_ZONE,
  rowsOf as countRows,
  seedOpened as openAccount,
  seedTemplate as fullTemplate,
} from './budget-copy-fixture';
import { startCategoryHarness, type CategoryHarness, type View } from './category-harness';

const PREFIX = 'user_2rondoCopyOf';

const USER = `${PREFIX}Owner`;

const ZONE = COPY_ZONE;
const TODAY = todayIn(ZONE);
const MONTH = monthOf(TODAY);
const LAST_MONTH = previousCalendarMonth(MONTH);
const FAR_MONTH = '2400-01';

const UNKNOWN_ID = '0199c1a8-9ecf-71c7-a617-c575df0739ff';

const RACE_ROUNDS = 8;
const RACE_TIMEOUT_MS = 60_000;

interface AccountsAnswer {
  accounts: { id: string; name: string; balance: string; openingEditable: boolean }[];
  total: string;
}

interface NetWorthAnswer {
  total: string;
  accounts: { name: string; balance: string }[];
  assets: { name: string; amount: string; date: string | null }[];
  liabilities: { name: string; amount: string; date: string | null }[];
}

const asRecord = (value: unknown): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`A response body is not an object: ${JSON.stringify(value)}`);
  }

  return { ...value };
};

const idOf = (body: unknown): string => {
  const { id } = asRecord(body);
  if (typeof id !== 'string') {
    throw new Error(`A response carries no id: ${JSON.stringify(body)}`);
  }

  return id;
};

describe('POST /budgets with a budget to start from (integration)', () => {
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

  const authorised = (userId: string, call: request.Test): request.Test =>
    call.set('Authorization', `Bearer ${harness.tokenFor(userId)}`);

  const post = (userId: string, path: string, body: Record<string, unknown>) =>
    authorised(userId, request(harness.server()).post(path)).send(body);

  const patch = (userId: string, path: string, body: Record<string, unknown>) =>
    authorised(userId, request(harness.server()).patch(path)).send(body);

  const copy = (userId: string, templateId: unknown, over: Record<string, unknown> = {}) =>
    post(userId, '/budgets', {
      language: 'ru',
      name: 'Копия',
      currency: 'PLN',
      timezone: ZONE,
      withDefaultCategories: false,
      templateId,
      idempotencyKey: 'copy',
      ...over,
    });

  const activate = (userId: string, id: string, idempotencyKey: string) =>
    post(userId, `/budgets/${id}/activate`, { idempotencyKey });

  const accountsOf = async (userId: string): Promise<AccountsAnswer> => {
    const response = await authorised(userId, request(harness.server()).get('/accounts')).expect(
      200,
    );

    return response.body as AccountsAnswer;
  };

  const netWorthOf = async (userId: string): Promise<NetWorthAnswer> => {
    const response = await authorised(userId, request(harness.server()).get('/net-worth')).expect(
      200,
    );

    return response.body as NetWorthAnswer;
  };

  const rowsOf = (userId: string) => countRows(harness, userId);

  const everythingOf = async (budgetId: string) => {
    const where = { budgetId };
    const orderBy = { id: 'asc' } as const;
    const { prisma } = harness;

    return {
      groups: await prisma.categoryGroup.findMany({ where, orderBy }),
      categories: await prisma.category.findMany({ where, orderBy }),
      targets: await prisma.categoryTarget.findMany({ where, orderBy }),
      paidMonths: await prisma.categoryPaidMonth.findMany({ where, orderBy }),
      accounts: await prisma.account.findMany({ where, orderBy }),
      transactions: await prisma.transaction.findMany({ where, orderBy }),
      assignments: await prisma.assignment.findMany({ where, orderBy }),
      assets: await prisma.asset.findMany({ where, orderBy }),
      liabilities: await prisma.liability.findMany({ where, orderBy }),
    };
  };

  const keysOf = (userId: string): Promise<number> =>
    harness.prisma.idempotencyKey.count({ where: { userId } });

  const activeIdsOf = async (userId: string): Promise<string[]> =>
    (await harness.prisma.budget.findMany({ where: { userId, active: true } })).map(
      (budget) => budget.id,
    );

  const treeOf = async (budgetId: string) => {
    const groups = await harness.prisma.categoryGroup.findMany({
      where: { budgetId },
      orderBy: { sortOrder: 'asc' },
      include: { categories: { orderBy: { sortOrder: 'asc' } } },
    });

    return groups.map((group) => ({
      name: group.name,
      sortOrder: group.sortOrder,
      categories: group.categories.map((category) => ({
        name: category.name,
        sortOrder: category.sortOrder,
        icon: category.icon,
        color: category.color,
      })),
    }));
  };

  const namesOf = (rows: { name: string }[]): string[] => rows.map((one) => one.name).sort();

  const seedOpened = (
    userId: string,
    budgetId: string,
    name: string,
    opening: bigint,
    over: Record<string, unknown> = {},
  ) => openAccount(harness, userId, budgetId, name, opening, over);

  const seedTemplate = (userId: string, over: Record<string, unknown> = {}) =>
    fullTemplate(harness, userId, over);

  describe('what the copy carries', () => {
    it('carries the groups, the categories with their look, the accounts, the assets and the liabilities', async () => {
      const { budget } = await seedTemplate(USER);

      const response = await copy(USER, budget.id);

      expect(response.status).toBe(201);
      const copyId = idOf(response.body);
      const written = await everythingOf(copyId);

      await expect(treeOf(copyId)).resolves.toEqual([
        {
          name: 'Дом',
          sortOrder: 0,
          categories: [
            { name: 'Жильё', sortOrder: 0, icon: 'home', color: 'blue' },
            { name: 'Свет', sortOrder: 1, icon: null, color: null },
          ],
        },
        {
          name: 'Жизнь',
          sortOrder: 1,
          categories: [{ name: 'Еда', sortOrder: 0, icon: 'shopping-cart', color: 'green' }],
        },
      ]);
      expect(written.accounts.map((account) => [account.name, account.type]).sort()).toEqual([
        ['Карта', 'DEBIT'],
        ['Наличные', 'CASH'],
      ]);
      expect(namesOf(written.assets)).toEqual(['Гараж', 'Машина']);
      expect(namesOf(written.liabilities)).toEqual(['Долг брату', 'Рассрочка']);
    });

    it('shares no row with the budget it was started from', async () => {
      const { budget } = await seedTemplate(USER);
      const original = await everythingOf(budget.id);

      const response = await copy(USER, budget.id);

      expect(response.status).toBe(201);
      const written = await everythingOf(idOf(response.body));
      const idsIn = (all: Record<string, { id: string }[]>): string[] =>
        Object.values(all).flatMap((rows) => rows.map((one) => one.id));
      const originalIds = new Set(idsIn(original));

      expect(idsIn(written).length).toBeGreaterThan(0);
      expect(idsIn(written).filter((id) => originalIds.has(id))).toEqual([]);
    });

    it('answers with the new budget in the shape every budget is answered in, active', async () => {
      const { budget } = await seedTemplate(USER);

      const response = await copy(USER, budget.id, { name: '  Новый год  ' });

      expect(response.status).toBe(201);
      expect(asRecord(response.body)).toMatchObject({
        name: 'Новый год',
        currency: 'PLN',
        minorDigits: 2,
        timezone: ZONE,
        firstMonth: MONTH,
        createdOn: TODAY,
        active: true,
      });
      expect(idOf(response.body)).not.toBe(budget.id);
    });

    it('writes one opening record of nothing per account and no other record, assignment or paid mark', async () => {
      const { budget } = await seedTemplate(USER);

      const response = await copy(USER, budget.id);

      expect(response.status).toBe(201);
      const written = await everythingOf(idOf(response.body));

      expect(written.accounts).toHaveLength(2);
      expect(
        written.transactions
          .map((one) => ({
            accountId: one.accountId,
            amount: one.amount,
            type: one.type,
            isSystem: one.isSystem,
            categoryId: one.categoryId,
            date: one.date.toISOString().slice(0, 10),
          }))
          .sort((left, right) => left.accountId.localeCompare(right.accountId)),
      ).toEqual(
        written.accounts
          .map((account) => ({
            accountId: account.id,
            amount: 0n,
            type: 'INCOME',
            isSystem: true,
            categoryId: null,
            date: TODAY,
          }))
          .sort((left, right) => left.accountId.localeCompare(right.accountId)),
      );
      expect(written.assignments).toEqual([]);
      expect(written.paidMonths).toEqual([]);
    });

    it('starts every asset and liability at nothing, with no day the amount was true', async () => {
      const { budget } = await seedTemplate(USER);

      const response = await copy(USER, budget.id);

      expect(response.status).toBe(201);
      const written = await everythingOf(idOf(response.body));

      expect(written.assets.map((one) => [one.amount, one.date])).toEqual([
        [0n, null],
        [0n, null],
      ]);
      expect(written.liabilities.map((one) => [one.amount, one.date])).toEqual([
        [0n, null],
        [0n, null],
      ]);
    });

    it('lists the accounts, the assets and the liabilities in the order the original lists them', async () => {
      const { budget, card, cash } = await seedTemplate(USER);
      const deposit = await seedOpened(USER, budget.id, 'Вклад', 0n);
      await harness.seedAsset(USER, budget.id, { name: 'Акции', amount: 1n });
      await harness.seedLiability(USER, budget.id, { name: 'Аванс', amount: 1n });
      const at = (seconds: number): Date => new Date(Date.now() - 60_000 + seconds * 1_000);
      const { prisma } = harness;
      await prisma.account.update({ where: { id: card.id }, data: { createdAt: at(0) } });
      await prisma.account.update({ where: { id: deposit.id }, data: { createdAt: at(1) } });
      await prisma.account.update({ where: { id: cash.id }, data: { createdAt: at(2) } });
      for (const [name, seconds] of [
        ['Машина', 0],
        ['Акции', 1],
        ['Гараж', 2],
      ] as const) {
        await prisma.asset.updateMany({
          where: { budgetId: budget.id, name },
          data: { createdAt: at(seconds) },
        });
      }
      for (const [name, seconds] of [
        ['Долг брату', 0],
        ['Аванс', 1],
        ['Рассрочка', 2],
      ] as const) {
        await prisma.liability.updateMany({
          where: { budgetId: budget.id, name },
          data: { createdAt: at(seconds) },
        });
      }
      const names = (rows: { name: string }[]): string[] => rows.map((one) => one.name);
      const before = { accounts: await accountsOf(USER), netWorth: await netWorthOf(USER) };

      const response = await copy(USER, budget.id);

      expect(response.status).toBe(201);
      const after = { accounts: await accountsOf(USER), netWorth: await netWorthOf(USER) };

      expect(names(before.accounts.accounts)).toEqual(['Карта', 'Вклад', 'Наличные']);
      expect(names(before.netWorth.assets)).toEqual(['Машина', 'Акции', 'Гараж']);
      expect(names(before.netWorth.liabilities)).toEqual(['Долг брату', 'Аванс', 'Рассрочка']);
      expect(names(after.accounts.accounts)).toEqual(names(before.accounts.accounts));
      expect(names(after.netWorth.assets)).toEqual(names(before.netWorth.assets));
      expect(names(after.netWorth.liabilities)).toEqual(names(before.netWorth.liabilities));
    });

    it('takes the rows of the budget it was pointed at, and none of the active one beside it', async () => {
      const active = await harness.seedBudget(USER, { name: 'Активный' });
      const activeGroup = await harness.seedGroup(USER, active.id, 'Активная группа');
      const activeCategory = await harness.seedCategory(
        USER,
        active.id,
        activeGroup.id,
        'Активная категория',
      );
      await harness.seedTarget(USER, active.id, activeCategory.id, {
        kind: 'CONTRIBUTE',
        amount: 11_100n,
        startMonth: LAST_MONTH,
      });
      await seedOpened(USER, active.id, 'Активный счёт', 1_000n);
      await harness.seedAsset(USER, active.id, { name: 'Активный актив', amount: 1n });
      await harness.seedLiability(USER, active.id, { name: 'Активный долг', amount: 1n });

      const { budget, housing } = await seedTemplate(USER, { active: false });
      await harness.seedTarget(USER, budget.id, housing.id, {
        kind: 'REFILL_TO',
        amount: 77_700n,
        startMonth: LAST_MONTH,
      });

      const response = await copy(USER, budget.id);

      expect(response.status).toBe(201);
      const copyId = idOf(response.body);
      const written = await everythingOf(copyId);

      expect(namesOf(written.groups)).toEqual(['Дом', 'Жизнь']);
      expect(namesOf(written.categories)).toEqual(['Еда', 'Жильё', 'Свет']);
      expect(written.targets.map((target) => [target.kind, target.amount])).toEqual([
        ['REFILL_TO', 77_700n],
      ]);
      expect(namesOf(written.accounts)).toEqual(['Карта', 'Наличные']);
      expect(namesOf(written.assets)).toEqual(['Гараж', 'Машина']);
      expect(namesOf(written.liabilities)).toEqual(['Долг брату', 'Рассрочка']);
      await expect(activeIdsOf(USER)).resolves.toEqual([copyId]);
    });

    it('takes the currency, its digit count and the timezone from the request, not from the original', async () => {
      const { budget } = await seedTemplate(USER, { timezone: 'Pacific/Pago_Pago' });

      const response = await copy(USER, budget.id, {
        currency: 'JPY',
        timezone: 'Pacific/Kiritimati',
      });

      expect(response.status).toBe(201);
      const copyId = idOf(response.body);
      const written = await everythingOf(copyId);

      await expect(
        harness.prisma.budget.findUniqueOrThrow({ where: { id: copyId } }),
      ).resolves.toMatchObject({
        currency: 'JPY',
        minorDigits: 0,
        timezone: 'Pacific/Kiritimati',
        active: true,
      });
      expect(todayIn('Pacific/Kiritimati')).not.toBe(todayIn('Pacific/Pago_Pago'));
      expect(written.transactions.map((one) => one.date.toISOString().slice(0, 10))).toEqual([
        todayIn('Pacific/Kiritimati'),
        todayIn('Pacific/Kiritimati'),
      ]);
      await expect(
        harness.prisma.budget.findUniqueOrThrow({ where: { id: budget.id } }),
      ).resolves.toMatchObject({ currency: 'PLN', minorDigits: 2, timezone: 'Pacific/Pago_Pago' });
    });

    it('lists groups and categories whose stored orders tie in the order the screen showed them', async () => {
      const budget = await harness.seedBudget(USER, { name: 'Исходный' });
      const tied = ['яблоки', 'Яблоки', 'Ёлка', 'Арбуз'];
      for (const name of tied) {
        const group = await harness.seedGroup(USER, budget.id, name, 3);
        for (const category of tied) {
          await harness.seedCategory(USER, budget.id, group.id, category, 5);
        }
      }
      const shape = (view: View) =>
        view.groups.map((group) => [group.name, group.categories.map((one) => one.name)]);
      const before = shape(await harness.viewOf(USER, MONTH));

      const response = await copy(USER, budget.id);

      expect(response.status).toBe(201);
      expect(before).toHaveLength(4);
      expect(shape(await harness.viewOf(USER, MONTH))).toEqual(before);
      await expect(treeOf(idOf(response.body))).resolves.toMatchObject(
        [0, 1, 2, 3].map((sortOrder) => ({
          sortOrder,
          categories: [{ sortOrder: 0 }, { sortOrder: 1 }, { sortOrder: 2 }, { sortOrder: 3 }],
        })),
      );
    });

    it('makes an empty active budget out of an original that has nothing in it', async () => {
      const empty = await harness.seedBudget(USER, { name: 'Пустой' });

      const response = await copy(USER, empty.id);

      expect(response.status).toBe(201);
      const copyId = idOf(response.body);

      await expect(activeIdsOf(USER)).resolves.toEqual([copyId]);
      await expect(accountsOf(USER)).resolves.toEqual({ accounts: [], total: '0' });
      expect((await harness.viewOf(USER, MONTH, true)).groups).toEqual([]);
      await expect(rowsOf(USER)).resolves.toMatchObject({
        budgets: 2,
        groups: 0,
        categories: 0,
        accounts: 0,
        transactions: 0,
      });
    });
  });

  describe('the money in the copy', () => {
    const everyAmountOf = (view: View): string[] =>
      view.groups.flatMap((group) =>
        group.categories.flatMap((category) => [
          category.assigned,
          category.activity,
          category.available,
          category.availableAllTime,
        ]),
      );

    it.each([
      ['the month the copy was made in', MONTH],
      ['a month far ahead, which sums every month before it', FAR_MONTH],
    ])('holds nothing anywhere, read in %s', async (_label, month) => {
      const { budget } = await seedTemplate(USER);

      const response = await copy(USER, budget.id);

      expect(response.status).toBe(201);
      const view = await harness.viewOf(USER, month, true);
      const accounts = await accountsOf(USER);
      const amounts = everyAmountOf(view);

      expect(amounts).toHaveLength(12);
      expect(new Set(amounts)).toEqual(new Set(['0']));
      expect(view.readyToAssign).toBe('0');
      expect(accounts.accounts.map((account) => account.balance)).toEqual(['0', '0']);
      expect(accounts.total).toBe('0');
    });

    it('counts nothing toward net worth', async () => {
      const { budget } = await seedTemplate(USER);

      const response = await copy(USER, budget.id);

      expect(response.status).toBe(201);
      const netWorth = await netWorthOf(USER);

      expect(netWorth.total).toBe('0');
      expect(netWorth.assets.map((one) => one.amount)).toEqual(['0', '0']);
      expect(netWorth.liabilities.map((one) => one.amount)).toEqual(['0', '0']);
    });

    it('keeps ready to assign plus every envelope equal to the accounts as money is entered into it', async () => {
      const { budget } = await seedTemplate(USER);
      const response = await copy(USER, budget.id);
      expect(response.status).toBe(201);

      const sides = async () => {
        const view = await harness.viewOf(USER, FAR_MONTH, true);
        const accounts = await accountsOf(USER);
        const envelopes = view.groups
          .flatMap((group) => group.categories)
          .reduce((sum, category) => sum + BigInt(category.availableAllTime), 0n);

        return {
          readyToAssign: BigInt(view.readyToAssign),
          envelopes,
          accounts: BigInt(accounts.total),
        };
      };

      const card = (await accountsOf(USER)).accounts.find((account) => account.name === 'Карта');
      const food = (await harness.viewOf(USER, MONTH)).groups
        .flatMap((group) => group.categories)
        .find((category) => category.name === 'Еда');
      if (!card || !food) {
        throw new Error('The copy carries no account or no category to enter money into');
      }

      expect(card.openingEditable).toBe(true);
      const opened = await patch(USER, `/accounts/${card.id}/opening-balance`, {
        amount: '50000',
        idempotencyKey: 'opening',
      });
      expect(opened.status).toBe(200);
      await expect(sides()).resolves.toEqual({
        readyToAssign: 50_000n,
        envelopes: 0n,
        accounts: 50_000n,
      });

      const moved = await post(USER, '/moves', {
        month: MONTH,
        amount: '20000',
        from: { kind: 'READY_TO_ASSIGN' },
        to: { kind: 'CATEGORY', categoryId: food.id },
        idempotencyKey: 'move',
      });
      expect(moved.status).toBe(201);
      await expect(sides()).resolves.toEqual({
        readyToAssign: 30_000n,
        envelopes: 20_000n,
        accounts: 50_000n,
      });

      const spent = await post(USER, '/transactions', {
        accountId: card.id,
        type: 'EXPENSE',
        amount: '5000',
        date: TODAY,
        categoryId: food.id,
        idempotencyKey: 'spend',
      });
      expect(spent.status).toBe(201);
      await expect(sides()).resolves.toEqual({
        readyToAssign: 30_000n,
        envelopes: 15_000n,
        accounts: 45_000n,
      });
    });
  });

  describe('the budget the copy was started from', () => {
    it('stops being active and keeps every row it had, and reads the same once it is active again', async () => {
      const { budget } = await seedTemplate(USER);
      const before = {
        rows: await everythingOf(budget.id),
        budget: await harness.prisma.budget.findUniqueOrThrow({ where: { id: budget.id } }),
        month: await harness.viewOf(USER, MONTH, true),
        far: await harness.viewOf(USER, FAR_MONTH, true),
        accounts: await accountsOf(USER),
        netWorth: await netWorthOf(USER),
      };

      const response = await copy(USER, budget.id);

      expect(response.status).toBe(201);
      const copyId = idOf(response.body);
      const kept = await harness.prisma.budget.findUniqueOrThrow({ where: { id: budget.id } });

      await expect(activeIdsOf(USER)).resolves.toEqual([copyId]);
      expect({ ...kept, active: true, updatedAt: before.budget.updatedAt }).toEqual(before.budget);
      expect(kept.active).toBe(false);
      await expect(everythingOf(budget.id)).resolves.toEqual(before.rows);

      expect((await activate(USER, budget.id, 'back')).status).toBe(200);

      expect(before.accounts.total).toBe('157700');
      await expect(harness.viewOf(USER, MONTH, true)).resolves.toEqual(before.month);
      await expect(harness.viewOf(USER, FAR_MONTH, true)).resolves.toEqual(before.far);
      await expect(accountsOf(USER)).resolves.toEqual(before.accounts);
      await expect(netWorthOf(USER)).resolves.toEqual(before.netWorth);
    });
  });

  describe('what the copy leaves behind', () => {
    it('leaves hidden categories, the categories of a hidden group, their goals and archived accounts', async () => {
      const budget = await harness.seedBudget(USER, { name: 'Исходный' });
      const hiddenAt = new Date();
      const shown = await harness.seedGroup(USER, budget.id, 'Видимая', 0);
      const gone = await harness.seedGroup(USER, budget.id, 'Скрытая группа', 1, hiddenAt);
      const emptied = await harness.seedGroup(USER, budget.id, 'Опустевшая', 2);
      await harness.seedCategory(USER, budget.id, shown.id, 'Остаётся', 0);
      const hidden = await harness.seedCategory(
        USER,
        budget.id,
        shown.id,
        'Скрытая категория',
        1,
        hiddenAt,
      );
      const orphan = await harness.seedCategory(USER, budget.id, gone.id, 'В скрытой группе', 0);
      await harness.seedCategory(USER, budget.id, emptied.id, 'Единственная', 0, hiddenAt);
      await harness.seedTarget(USER, budget.id, hidden.id, {
        kind: 'CONTRIBUTE',
        amount: 10_000n,
        startMonth: LAST_MONTH,
      });
      await harness.seedTarget(USER, budget.id, orphan.id, {
        kind: 'CONTRIBUTE',
        amount: 20_000n,
        startMonth: LAST_MONTH,
      });
      await seedOpened(USER, budget.id, 'Открытый', 0n);
      await seedOpened(USER, budget.id, 'Архивный', 0n, { archivedAt: hiddenAt });

      const response = await copy(USER, budget.id);

      expect(response.status).toBe(201);
      const copyId = idOf(response.body);
      const written = await everythingOf(copyId);

      await expect(treeOf(copyId)).resolves.toEqual([
        {
          name: 'Видимая',
          sortOrder: 0,
          categories: [{ name: 'Остаётся', sortOrder: 0, icon: null, color: null }],
        },
        { name: 'Опустевшая', sortOrder: 1, categories: [] },
      ]);
      expect(written.targets).toEqual([]);
      expect(namesOf(written.accounts)).toEqual(['Открытый']);
      expect(written.transactions).toHaveLength(1);
      expect(written.groups.every((group) => group.hiddenAt === null)).toBe(true);
    });

    it('closes the gaps the hidden rows left, so the next category and the next group come last', async () => {
      const budget = await harness.seedBudget(USER, { name: 'Исходный' });
      const hiddenAt = new Date();
      const first = await harness.seedGroup(USER, budget.id, 'Эта группа', 0);
      await harness.seedGroup(USER, budget.id, 'Скрытая группа', 1, hiddenAt);
      await harness.seedGroup(USER, budget.id, 'Яркая группа', 2);
      await harness.seedCategory(USER, budget.id, first.id, 'Электричество', 0);
      await harness.seedCategory(USER, budget.id, first.id, 'Скрытая', 1, hiddenAt);
      await harness.seedCategory(USER, budget.id, first.id, 'Яблоки', 2);

      const response = await copy(USER, budget.id);
      expect(response.status).toBe(201);
      const copyId = idOf(response.body);
      const copied = await harness.prisma.categoryGroup.findFirstOrThrow({
        where: { budgetId: copyId, name: 'Эта группа' },
      });

      const category = await post(USER, '/categories', {
        groupId: copied.id,
        name: 'Абрикосы',
        idempotencyKey: 'category',
      });
      const group = await post(USER, '/category-groups', {
        name: 'Аренда',
        idempotencyKey: 'group',
      });

      expect([category.status, group.status]).toEqual([201, 201]);
      const view = await harness.viewOf(USER, MONTH);

      expect(view.groups.map((one) => one.name)).toEqual(['Эта группа', 'Яркая группа', 'Аренда']);
      expect(view.groups[0]?.categories.map((one) => one.name)).toEqual([
        'Электричество',
        'Яблоки',
        'Абрикосы',
      ]);
      await expect(treeOf(copyId)).resolves.toMatchObject([
        { sortOrder: 0, categories: [{ sortOrder: 0 }, { sortOrder: 1 }, { sortOrder: 2 }] },
        { sortOrder: 1 },
        { sortOrder: 2 },
      ]);
    });
  });

  describe('goals', () => {
    const seedGoals = async (userId: string, over: Record<string, unknown> = {}) => {
      const budget = await harness.seedBudget(userId, { name: 'Исходный', ...over });
      const group = await harness.seedGroup(userId, budget.id, 'Цели', 0);
      const named = async (name: string, sortOrder: number) =>
        harness.seedCategory(userId, budget.id, group.id, name, sortOrder);

      const live = await named('Живая', 0);
      const closed = await named('Закрытая в этом месяце', 1);
      const overdue = await named('Просроченная', 2);
      const dated = await named('Со сроком впереди', 3);
      await named('Без цели', 4);

      await harness.seedTarget(userId, budget.id, live.id, {
        kind: 'CONTRIBUTE',
        amount: 50_000n,
        startMonth: previousCalendarMonth(LAST_MONTH),
      });
      await harness.seedTarget(userId, budget.id, closed.id, {
        kind: 'REFILL_TO',
        amount: 30_000n,
        startMonth: LAST_MONTH,
        endMonth: MONTH,
      });
      await harness.seedTarget(userId, budget.id, overdue.id, {
        kind: 'BY_DATE',
        amount: 90_000n,
        startMonth: previousCalendarMonth(LAST_MONTH),
        dueMonth: LAST_MONTH,
      });
      await harness.seedTarget(userId, budget.id, dated.id, {
        kind: 'BY_DATE',
        amount: 240_000n,
        startMonth: LAST_MONTH,
        dueMonth: nextCalendarMonth(nextCalendarMonth(MONTH)),
      });

      return budget;
    };

    it('come along when the currency stays the same, starting over in the month of the copy', async () => {
      const budget = await seedGoals(USER);

      const response = await copy(USER, budget.id);

      expect(response.status).toBe(201);
      const view = await harness.viewOf(USER, MONTH);
      const goals = Object.fromEntries(
        view.groups
          .flatMap((group) => group.categories)
          .map((category) => [
            category.name,
            category.target === null
              ? null
              : {
                  kind: category.target.kind,
                  amount: category.target.amount,
                  startMonth: category.target.startMonth,
                  dueMonth: category.target.dueMonth,
                },
          ]),
      );

      expect(goals).toEqual({
        Живая: { kind: 'CONTRIBUTE', amount: '50000', startMonth: MONTH, dueMonth: undefined },
        'Закрытая в этом месяце': null,
        Просроченная: null,
        'Со сроком впереди': {
          kind: 'BY_DATE',
          amount: '240000',
          startMonth: MONTH,
          dueMonth: nextCalendarMonth(nextCalendarMonth(MONTH)),
        },
        'Без цели': null,
      });
      const written = await everythingOf(idOf(response.body));
      expect(written.targets.map((target) => target.endMonth)).toEqual([null, null]);
    });

    it('stay behind when the copy is in another currency, even one with the same digit count', async () => {
      const budget = await seedGoals(USER);

      const response = await copy(USER, budget.id, { currency: 'EUR' });

      expect(response.status).toBe(201);
      const written = await everythingOf(idOf(response.body));

      expect(written.categories).toHaveLength(5);
      expect(written.targets).toEqual([]);
    });

    it('stay behind when the original froze another digit count for the same currency', async () => {
      const budget = await seedGoals(USER, { currency: 'PLN', minorDigits: 3 });

      const response = await copy(USER, budget.id);

      expect(response.status).toBe(201);
      const written = await everythingOf(idOf(response.body));

      expect(written.categories).toHaveLength(5);
      expect(written.targets).toEqual([]);
    });
  });

  describe('a request that is refused', () => {
    it('refuses a budget to start from together with the starter set, and writes nothing', async () => {
      const { budget } = await seedTemplate(USER);
      const before = await rowsOf(USER);

      const response = await copy(USER, budget.id, { withDefaultCategories: true });

      expect(response.status).toBe(400);
      expect(asRecord(response.body)['reason']).toBe('TEMPLATE_WITH_DEFAULTS');
      await expect(rowsOf(USER)).resolves.toEqual(before);
      await expect(keysOf(USER)).resolves.toBe(0);
      await expect(activeIdsOf(USER)).resolves.toEqual([budget.id]);
    });

    it('answers a budget nobody has with the reason, which a malformed id never gets as far as', async () => {
      const { budget } = await seedTemplate(USER);
      const before = await rowsOf(USER);

      const malformed = await Promise.all(
        ['not-a-uuid', '', 123, null].map((templateId, index) =>
          copy(USER, templateId, { idempotencyKey: `malformed-${index}` }),
        ),
      );
      const unknown = await copy(USER, UNKNOWN_ID, { idempotencyKey: 'unknown' });

      expect(malformed.map((response) => response.status)).toEqual([400, 400, 400, 400]);
      expect(malformed.map((response) => asRecord(response.body)['reason'])).toEqual([
        undefined,
        undefined,
        undefined,
        undefined,
      ]);
      expect(unknown.status).toBe(400);
      expect(asRecord(unknown.body)['reason']).toBe('UNKNOWN_BUDGET');
      await expect(rowsOf(USER)).resolves.toEqual(before);
      await expect(keysOf(USER)).resolves.toBe(0);
      await expect(activeIdsOf(USER)).resolves.toEqual([budget.id]);
    });
  });

  describe('a request that is repeated', () => {
    it('answers a repeat of the key with the first result and copies nothing twice, even after the active budget changed', async () => {
      const { budget } = await seedTemplate(USER);
      const first = await copy(USER, budget.id);
      expect(first.status).toBe(201);
      expect((await activate(USER, budget.id, 'back')).status).toBe(200);
      const before = await rowsOf(USER);

      const again = await copy(USER, budget.id);

      expect(again.status).toBe(201);
      expect(again.body).toEqual(first.body);
      expect(before).toMatchObject({ budgets: 2, groups: 4, categories: 6, accounts: 4 });
      await expect(rowsOf(USER)).resolves.toEqual(before);
      await expect(activeIdsOf(USER)).resolves.toEqual([budget.id]);
    });

    it('refuses the key when it comes back with another budget to start from, or with none', async () => {
      const { budget } = await seedTemplate(USER);
      const other = await harness.seedBudget(USER, { name: 'Другой', active: false });
      const first = await copy(USER, budget.id);
      expect(first.status).toBe(201);
      const before = await rowsOf(USER);

      const another = await copy(USER, other.id);
      const none = await copy(USER, undefined);

      expect([another.status, none.status]).toEqual([409, 409]);
      await expect(rowsOf(USER)).resolves.toEqual(before);
    });

    it(
      'makes one copy out of two requests carrying one key at once',
      async () => {
        for (let round = 0; round < RACE_ROUNDS; round += 1) {
          const userId = `${PREFIX}Twice${round}`;
          const { budget } = await seedTemplate(userId);
          const before = await rowsOf(userId);

          const responses = await Promise.all([copy(userId, budget.id), copy(userId, budget.id)]);

          expect(responses.map((response) => response.status)).toEqual([201, 201]);
          expect(responses[1]?.body).toEqual(responses[0]?.body);
          await expect(rowsOf(userId)).resolves.toEqual({
            ...before,
            budgets: 2,
            groups: before.groups * 2,
            categories: before.categories * 2,
            accounts: before.accounts * 2,
            transactions: before.transactions + before.accounts,
            assets: before.assets * 2,
            liabilities: before.liabilities * 2,
          });
          await expect(activeIdsOf(userId)).resolves.toEqual([idOf(responses[0]?.body)]);
        }
      },
      RACE_TIMEOUT_MS,
    );
  });
});
