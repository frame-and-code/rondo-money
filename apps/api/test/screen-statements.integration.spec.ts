import { randomUUID } from 'node:crypto';

import { TransactionType } from '@rondo/db';
import { parseCalendarDate, toDbDate } from '@rondo/types';
import { Client } from 'pg';
import request from 'supertest';

import { startCategoryHarness, type CategoryHarness, type View } from './category-harness';

const USER_PREFIX = 'user_2rondoScreenStatements';

const USER_SMALL = `${USER_PREFIX}Small`;
const USER_LARGE = `${USER_PREFIX}Large`;
const USER_FEED = `${USER_PREFIX}Feed`;

const MONTH = '2026-08';
const FUTURE_MONTH = '2026-11';

const OPENED = new Date('2026-01-01T09:00:00Z');
const HIDDEN_LONG_AGO = new Date('2026-01-01T09:00:00Z');

const TARGET_KINDS = ['REFILL_TO', 'CONTRIBUTE', 'BY_DATE', 'ACCUMULATE'] as const;

interface Shape {
  groups: number;
  categoriesPerGroup: number;
  openAccounts: number;
  archivedAccounts: number;
  payees: number;
  netWorthItems: number;
  spareBudgets: number;
}

const SMALL: Shape = {
  groups: 2,
  categoriesPerGroup: 2,
  openAccounts: 2,
  archivedAccounts: 1,
  payees: 1,
  netWorthItems: 1,
  spareBudgets: 0,
};

const LARGE: Shape = {
  groups: 10,
  categoriesPerGroup: 3,
  openAccounts: 10,
  archivedAccounts: 3,
  payees: 10,
  netWorthItems: 10,
  spareBudgets: 3,
};

const FEED_DAYS = 45;
const FEED_PAYEE = 'Кафе у дома';

interface FeedRow {
  accountId: string;
  type: string;
  transferId: string | null;
  counterAccountId: string | null;
}

interface Feed {
  transactions: FeedRow[];
  days: { date: string; total: string }[];
  nextCursor: string | null;
}

interface Accounts {
  accounts: unknown[];
}

interface NetWorth {
  accounts: unknown[];
  assets: unknown[];
  liabilities: unknown[];
}

interface Counted<T> {
  statements: number;
  body: T;
}

interface FeedIds {
  main: string;
  savings: string;
  category: string;
}

function visibleCategories(shape: Shape, includeHidden: boolean): number {
  return includeHidden
    ? shape.groups * shape.categoriesPerGroup
    : (shape.groups - 1) * (shape.categoriesPerGroup - 1);
}

function categoriesIn(view: View) {
  return view.groups.flatMap((group) => group.categories);
}

function dayBefore(day: string, back: number): string {
  const moment = new Date(`${day}T00:00:00Z`);
  moment.setUTCDate(moment.getUTCDate() - back);

  return moment.toISOString().slice(0, 10);
}

describe('what a screen costs the database as the budget grows (integration)', () => {
  let harness: CategoryHarness;
  let feedIds: FeedIds;

  const send = (userId: string, path: string) =>
    request(harness.server())
      .get(path)
      .set('Authorization', `Bearer ${harness.tokenFor(userId)}`)
      .expect(200);

  const counted = async <T>(userId: string, path: string): Promise<Counted<T>> => {
    await send(userId, path);

    const statements = jest.spyOn(Client.prototype, 'query');

    try {
      const response = await send(userId, path);

      return { statements: statements.mock.calls.length, body: response.body as T };
    } finally {
      statements.mockRestore();
    }
  };

  const record = (
    userId: string,
    budgetId: string,
    accountId: string,
    day: string,
    over: Record<string, unknown>,
  ) =>
    harness.prisma.transaction.create({
      data: {
        userId,
        budgetId,
        accountId,
        date: toDbDate(parseCalendarDate(day)),
        amount: -1000n,
        type: TransactionType.EXPENSE,
        ...over,
      },
    });

  const seedScreens = async (userId: string, shape: Shape): Promise<void> => {
    const budget = await harness.seedBudget(userId);

    for (let spare = 0; spare < shape.spareBudgets; spare += 1) {
      await harness.seedBudget(userId, { name: `Запасной ${spare}`, active: false });
    }

    const accounts: string[] = [];
    for (let index = 0; index < shape.openAccounts; index += 1) {
      const account = await harness.seedAccount(userId, budget.id, {
        name: `Счёт ${index}`,
        createdAt: OPENED,
      });
      await record(userId, budget.id, account.id, '2026-01-01', {
        type: TransactionType.INCOME,
        amount: 1_000_000n,
        isSystem: true,
      });
      accounts.push(account.id);
    }

    for (let index = 0; index < shape.archivedAccounts; index += 1) {
      await harness.seedAccount(userId, budget.id, {
        name: `Архив ${index}`,
        createdAt: OPENED,
        archivedAt: HIDDEN_LONG_AGO,
      });
    }

    const categories: string[] = [];
    for (let group = 0; group < shape.groups; group += 1) {
      const written = await harness.seedGroup(
        userId,
        budget.id,
        `Группа ${group}`,
        group,
        group === 0 ? HIDDEN_LONG_AGO : null,
      );

      for (let inner = 0; inner < shape.categoriesPerGroup; inner += 1) {
        const category = await harness.seedCategory(
          userId,
          budget.id,
          written.id,
          `Категория ${group}.${inner}`,
          inner,
          inner === shape.categoriesPerGroup - 1 ? HIDDEN_LONG_AGO : null,
        );
        categories.push(category.id);
      }
    }

    for (const [index, categoryId] of categories.entries()) {
      const accountId = accounts[index % accounts.length] ?? '';

      for (const day of ['2026-07-15', '2026-08-15']) {
        await record(userId, budget.id, accountId, day, {
          categoryId,
          payee: `Получатель ${index % shape.payees}`,
        });
      }

      await harness.seedAssignment(userId, budget.id, categoryId, MONTH, 5_000n);
      await harness.seedAssignment(userId, budget.id, categoryId, FUTURE_MONTH, 1_000n);

      const kind = TARGET_KINDS[index % TARGET_KINDS.length] ?? 'REFILL_TO';
      await harness.seedTarget(userId, budget.id, categoryId, {
        kind,
        amount: 10_000n,
        startMonth: '2026-06',
        dueMonth: kind === 'BY_DATE' ? '2026-12' : null,
      });
      await harness.seedTarget(userId, budget.id, categoryId, {
        kind: 'CONTRIBUTE',
        amount: 2_000n,
        startMonth: '2026-04',
        endMonth: '2026-05',
      });

      await harness.seedPaid(userId, budget.id, categoryId, MONTH);
    }

    for (const [index, fromAccountId] of accounts.entries()) {
      await harness.seedTransfer(
        userId,
        budget.id,
        { fromAccountId, toAccountId: accounts[(index + 1) % accounts.length] ?? '' },
        '2026-08-10',
        500n,
      );
    }

    for (let index = 0; index < shape.netWorthItems; index += 1) {
      await harness.seedAsset(userId, budget.id, { name: `Актив ${index}`, amount: 100n });
      await harness.seedLiability(userId, budget.id, { name: `Долг ${index}`, amount: 50n });
    }
  };

  const seedFeed = async (): Promise<FeedIds> => {
    const budget = await harness.seedBudget(USER_FEED);
    const main = await harness.seedAccount(USER_FEED, budget.id, {
      name: 'Основной',
      createdAt: OPENED,
    });
    const savings = await harness.seedAccount(USER_FEED, budget.id, {
      name: 'Сбережения',
      createdAt: OPENED,
    });
    const group = await harness.seedGroup(USER_FEED, budget.id, 'Повседневные');
    const category = await harness.seedCategory(USER_FEED, budget.id, group.id, 'Кафе');

    const rows = Array.from({ length: FEED_DAYS }, (_, back) => {
      const day = dayBefore('2026-08-31', back);
      const date = toDbDate(parseCalendarDate(day));
      const at = (minute: number) => new Date(`${day}T10:0${minute}:00Z`);
      const transferId = randomUUID();
      const shared = { userId: USER_FEED, budgetId: budget.id, date };

      return [
        {
          ...shared,
          accountId: savings.id,
          amount: 500n,
          type: TransactionType.TRANSFER,
          transferId,
          createdAt: at(2),
        },
        {
          ...shared,
          accountId: main.id,
          categoryId: category.id,
          amount: -1000n,
          type: TransactionType.EXPENSE,
          payee: FEED_PAYEE,
          createdAt: at(1),
        },
        {
          ...shared,
          accountId: main.id,
          amount: -500n,
          type: TransactionType.TRANSFER,
          transferId,
          createdAt: at(0),
        },
      ];
    }).flat();

    await harness.prisma.transaction.createMany({ data: rows });

    return { main: main.id, savings: savings.id, category: category.id };
  };

  beforeAll(async () => {
    harness = await startCategoryHarness(USER_PREFIX);
    await harness.removeFixtures();

    await seedScreens(USER_SMALL, SMALL);
    await seedScreens(USER_LARGE, LARGE);
    feedIds = await seedFeed();
  });

  afterAll(async () => {
    await harness.removeFixtures();
    await harness.close();
  });

  describe('a screen over the whole budget', () => {
    it.each([false, true])(
      'reads the month of thirty categories in as many statements as the month of four (hidden shown: %s)',
      async (includeHidden) => {
        const path = `/budget-view?month=${MONTH}${includeHidden ? '&includeHidden=true' : ''}`;

        const small = await counted<View>(USER_SMALL, path);
        const large = await counted<View>(USER_LARGE, path);

        for (const [answer, shape] of [
          [small.body, SMALL],
          [large.body, LARGE],
        ] as const) {
          expect(categoriesIn(answer)).toHaveLength(visibleCategories(shape, includeHidden));
          expect(categoriesIn(answer).some((category) => category.target !== null)).toBe(true);
          expect(categoriesIn(answer).some((category) => category.paid)).toBe(true);
        }
        expect(small.statements).toBeGreaterThan(0);
        expect(large.statements).toBe(small.statements);
      },
    );

    it('lists ten accounts in as many statements as two', async () => {
      const small = await counted<Accounts>(USER_SMALL, '/accounts');
      const large = await counted<Accounts>(USER_LARGE, '/accounts');

      expect(small.body.accounts).toHaveLength(SMALL.openAccounts);
      expect(large.body.accounts).toHaveLength(LARGE.openAccounts);
      expect(small.statements).toBeGreaterThan(0);
      expect(large.statements).toBe(small.statements);
    });

    it('adds up net worth over dozens of rows in as many statements as over a handful', async () => {
      const small = await counted<NetWorth>(USER_SMALL, '/net-worth');
      const large = await counted<NetWorth>(USER_LARGE, '/net-worth');

      expect(small.body.accounts).toHaveLength(SMALL.openAccounts);
      expect(small.body.assets).toHaveLength(SMALL.netWorthItems);
      expect(large.body.accounts).toHaveLength(LARGE.openAccounts);
      expect(large.body.assets).toHaveLength(LARGE.netWorthItems);
      expect(large.body.liabilities).toHaveLength(LARGE.netWorthItems);
      expect(small.statements).toBeGreaterThan(0);
      expect(large.statements).toBe(small.statements);
    });

    it('lists four budgets in as many statements as one', async () => {
      const small = await counted<unknown[]>(USER_SMALL, '/budgets');
      const large = await counted<unknown[]>(USER_LARGE, '/budgets');

      expect(small.body).toHaveLength(1 + SMALL.spareBudgets);
      expect(large.body).toHaveLength(1 + LARGE.spareBudgets);
      expect(small.statements).toBeGreaterThan(0);
      expect(large.statements).toBe(small.statements);
    });

    it('offers ten payees in as many statements as one', async () => {
      const small = await counted<{ payees: string[] }>(USER_SMALL, '/transactions/payees');
      const large = await counted<{ payees: string[] }>(USER_LARGE, '/transactions/payees');

      expect(small.body.payees).toHaveLength(SMALL.payees);
      expect(large.body.payees).toHaveLength(LARGE.payees);
      expect(small.statements).toBeGreaterThan(0);
      expect(large.statements).toBe(small.statements);
    });
  });

  describe('a page of the feed', () => {
    const pagesOf = async (query: string): Promise<[Counted<Feed>, Counted<Feed>]> => [
      await counted<Feed>(USER_FEED, `/transactions?limit=2${query}`),
      await counted<Feed>(USER_FEED, `/transactions?limit=40${query}`),
    ];

    const expectFull = (page: Counted<Feed>, limit: number): void => {
      expect(page.body.transactions).toHaveLength(limit);
      expect(page.body.nextCursor).not.toBeNull();
      expect(page.body.days.length).toBeGreaterThan(0);
    };

    const legsOf = (page: Counted<Feed>): FeedRow[] =>
      page.body.transactions.filter((row) => row.transferId !== null);

    it.each([
      { view: 'every account', query: () => '' },
      { view: 'one account', query: (ids: FeedIds) => `&accountId=${ids.main}` },
      { view: 'transfers only', query: () => '&type=TRANSFER' },
      { view: 'one period', query: () => '&from=2026-07-25&to=2026-08-31' },
    ])(
      'names the other account of forty transfer legs in as many statements as of one ($view)',
      async ({ query }) => {
        const [two, forty] = await pagesOf(query(feedIds));

        expectFull(two, 2);
        expectFull(forty, 40);
        for (const page of [two, forty]) {
          expect(legsOf(page).length).toBeGreaterThan(0);
          expect(legsOf(page).every((row) => row.counterAccountId !== null)).toBe(true);
        }
        expect(two.statements).toBeGreaterThan(0);
        expect(forty.statements).toBe(two.statements);
      },
    );

    it('names the other account of a leg whose pair is off the page, on every page of one account', async () => {
      const [two, forty] = await pagesOf(`&accountId=${feedIds.main}`);

      for (const page of [two, forty]) {
        expect(legsOf(page).every((row) => row.counterAccountId === feedIds.savings)).toBe(true);
      }
      expect(legsOf(forty)).toHaveLength(20);
      expect(forty.statements).toBe(two.statements);
    });

    it.each([
      { view: 'one envelope', query: (ids: FeedIds) => `&categoryId=${ids.category}` },
      { view: 'one payee', query: () => `&payee=${encodeURIComponent(FEED_PAYEE)}` },
    ])('reads forty records in as many statements as two ($view)', async ({ query }) => {
      const [two, forty] = await pagesOf(query(feedIds));

      expectFull(two, 2);
      expectFull(forty, 40);
      expect(two.statements).toBeGreaterThan(0);
      expect(forty.statements).toBe(two.statements);
    });

    it('reads the page after a cursor in as many statements for forty records as for two', async () => {
      const pageAfter = async (limit: number): Promise<Counted<Feed>> => {
        const first = await send(USER_FEED, `/transactions?limit=${limit}`);
        const cursor = (first.body as Feed).nextCursor ?? '';

        return counted<Feed>(
          USER_FEED,
          `/transactions?limit=${limit}&cursor=${encodeURIComponent(cursor)}`,
        );
      };

      const two = await pageAfter(2);
      const forty = await pageAfter(40);

      expectFull(two, 2);
      expectFull(forty, 40);
      expect(legsOf(forty).every((row) => row.counterAccountId !== null)).toBe(true);
      expect(two.statements).toBeGreaterThan(0);
      expect(forty.statements).toBe(two.statements);
    });
  });
});
