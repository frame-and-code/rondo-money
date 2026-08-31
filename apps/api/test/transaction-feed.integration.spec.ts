import { TransactionType } from '@rondo/db';
import { parseCalendarDate, toDbDate, todayIn } from '@rondo/types';
import request from 'supertest';

import { startCategoryHarness, type CategoryHarness } from './category-harness';

const USER_PREFIX = 'user_2rondoFeed';

const USER_READS = `${USER_PREFIX}Reads`;
const USER_PAGES = `${USER_PREFIX}Pages`;
const USER_FILTERS = `${USER_PREFIX}Filters`;
const USER_CLOSED = `${USER_PREFIX}Closed`;
const USER_PAIRS = `${USER_PREFIX}Pairs`;
const USER_KNOWN = `${USER_PREFIX}Known`;

const ZONE = 'Europe/Warsaw';

const OPENED = new Date('2020-01-01T09:00:00Z');

interface FeedRow {
  id: string;
  accountId: string;
  categoryId: string | null;
  date: string;
  amount: string;
  type: string;
  payee: string | null;
  isSystem: boolean;
  transferId: string | null;
  counterAccountId: string | null;
  createdAt: string;
}

interface FeedDay {
  date: string;
  total: string;
}

interface Feed {
  transactions: FeedRow[];
  days: FeedDay[];
  nextCursor: string | null;
}

describe('the feed of what a budget recorded (integration)', () => {
  let harness: CategoryHarness;

  const TODAY = todayIn(ZONE);

  const feed = async (userId: string, query = ''): Promise<Feed> => {
    const response = await request(harness.server())
      .get(`/transactions${query}`)
      .set('Authorization', `Bearer ${harness.tokenFor(userId)}`)
      .expect(200);

    return response.body as Feed;
  };

  const payeesOf = async (userId: string): Promise<string[]> => {
    const response = await request(harness.server())
      .get('/transactions/payees')
      .set('Authorization', `Bearer ${harness.tokenFor(userId)}`)
      .expect(200);

    return (response.body as { payees: string[] }).payees;
  };

  const seedRow = (
    userId: string,
    budgetId: string,
    accountId: string,
    over: Record<string, unknown>,
  ) =>
    harness.prisma.transaction.create({
      data: {
        userId,
        budgetId,
        accountId,
        date: toDbDate(parseCalendarDate(TODAY)),
        amount: -1000n,
        type: TransactionType.EXPENSE,
        ...over,
      },
    });

  const budgetOf = async (userId: string) => {
    const budget = await harness.seedBudget(userId);
    const account = await harness.seedAccount(userId, budget.id, { createdAt: OPENED });
    const group = await harness.seedGroup(userId, budget.id, 'Повседневные');
    const category = await harness.seedCategory(userId, budget.id, group.id, 'Кафе');

    return { budget, account, group, category };
  };

  beforeAll(async () => {
    harness = await startCategoryHarness(USER_PREFIX);
  });

  afterAll(async () => {
    await harness.removeFixtures();
    await harness.close();
  });

  beforeEach(async () => {
    await harness.removeFixtures();
  });

  describe('the order it comes in', () => {
    it('runs from the newest day down, and inside a day from the last record entered', async () => {
      const { budget, account, category } = await budgetOf(USER_READS);

      await seedRow(USER_READS, budget.id, account.id, {
        categoryId: category.id,
        date: toDbDate('2026-06-01'),
        payee: 'старое',
        createdAt: new Date('2026-06-01T10:00:00Z'),
      });
      await seedRow(USER_READS, budget.id, account.id, {
        categoryId: category.id,
        date: toDbDate('2026-06-02'),
        payee: 'внесено первым',
        createdAt: new Date('2026-06-03T08:00:00Z'),
      });
      await seedRow(USER_READS, budget.id, account.id, {
        categoryId: category.id,
        date: toDbDate('2026-06-02'),
        payee: 'внесено вторым',
        createdAt: new Date('2026-06-03T09:00:00Z'),
      });

      const answer = await feed(USER_READS);

      expect(answer.transactions.map((row) => row.payee)).toEqual([
        'внесено вторым',
        'внесено первым',
        'старое',
      ]);
    });

    it('carries the total of each day it lists', async () => {
      const { budget, account, category } = await budgetOf(USER_READS);

      await seedRow(USER_READS, budget.id, account.id, {
        categoryId: category.id,
        date: toDbDate('2026-06-02'),
        amount: -1500n,
      });
      await seedRow(USER_READS, budget.id, account.id, {
        categoryId: category.id,
        date: toDbDate('2026-06-02'),
        amount: -2500n,
      });

      const answer = await feed(USER_READS);

      expect(answer.days).toEqual([{ date: '2026-06-02', total: '-4000' }]);
    });
  });

  describe('the pages it comes in', () => {
    it('loses no record and repeats none across a page boundary', async () => {
      const { budget, account, category } = await budgetOf(USER_PAGES);

      for (let index = 0; index < 5; index += 1) {
        await seedRow(USER_PAGES, budget.id, account.id, {
          categoryId: category.id,
          date: toDbDate('2026-06-02'),
          payee: `запись ${index}`,
          createdAt: new Date(Date.parse('2026-06-02T08:00:00Z') + index * 60_000),
        });
      }

      const first = await feed(USER_PAGES, '?limit=2');
      expect(first.transactions).toHaveLength(2);
      expect(first.nextCursor).not.toBeNull();

      const second = await feed(
        USER_PAGES,
        `?limit=2&cursor=${encodeURIComponent(String(first.nextCursor))}`,
      );
      const third = await feed(
        USER_PAGES,
        `?limit=2&cursor=${encodeURIComponent(String(second.nextCursor))}`,
      );

      const seen = [...first.transactions, ...second.transactions, ...third.transactions].map(
        (row) => row.payee,
      );

      expect(seen).toEqual(['запись 4', 'запись 3', 'запись 2', 'запись 1', 'запись 0']);
      expect(third.nextCursor).toBeNull();
    });

    it('gives a day cut by a page boundary the same total on both pages', async () => {
      const { budget, account, category } = await budgetOf(USER_PAGES);

      for (let index = 0; index < 3; index += 1) {
        await seedRow(USER_PAGES, budget.id, account.id, {
          categoryId: category.id,
          date: toDbDate('2026-06-02'),
          amount: -1000n,
          createdAt: new Date(Date.parse('2026-06-02T08:00:00Z') + index * 60_000),
        });
      }

      const first = await feed(USER_PAGES, '?limit=2');
      const second = await feed(
        USER_PAGES,
        `?limit=2&cursor=${encodeURIComponent(String(first.nextCursor))}`,
      );

      expect(first.days).toEqual([{ date: '2026-06-02', total: '-3000' }]);
      expect(second.days).toEqual([{ date: '2026-06-02', total: '-3000' }]);
    });
  });

  describe('what a filter narrows it to', () => {
    const seedMixed = async () => {
      const { budget, account, category } = await budgetOf(USER_FILTERS);
      const other = await harness.seedAccount(USER_FILTERS, budget.id, {
        name: 'Карта',
        createdAt: OPENED,
      });
      const second = await harness.seedCategory(
        USER_FILTERS,
        budget.id,
        (await harness.seedGroup(USER_FILTERS, budget.id, 'Радости', 1)).id,
        'Развлечения',
      );

      await seedRow(USER_FILTERS, budget.id, account.id, {
        categoryId: category.id,
        date: toDbDate('2026-06-02'),
        payee: 'Кофейня на углу',
        amount: -1000n,
      });
      await seedRow(USER_FILTERS, budget.id, account.id, {
        categoryId: second.id,
        date: toDbDate('2026-07-02'),
        payee: 'Кинотеатр',
        amount: -2000n,
      });
      await seedRow(USER_FILTERS, budget.id, other.id, {
        date: toDbDate('2026-07-03'),
        payee: 'Работа',
        amount: 500_000n,
        type: TransactionType.INCOME,
      });
      await seedRow(USER_FILTERS, budget.id, account.id, {
        date: toDbDate('2026-05-01'),
        amount: 100_000n,
        type: TransactionType.INCOME,
        isSystem: true,
      });

      return { budget, account, other, category, second };
    };

    it('narrows to one payee', async () => {
      await seedMixed();

      const answer = await feed(USER_FILTERS, '?payee=Кинотеатр');

      expect(answer.transactions.map((row) => row.payee)).toEqual(['Кинотеатр']);
    });

    it('narrows to one category', async () => {
      const { second } = await seedMixed();

      const answer = await feed(USER_FILTERS, `?categoryId=${second.id}`);

      expect(answer.transactions.map((row) => row.payee)).toEqual(['Кинотеатр']);
    });

    it('narrows to one account', async () => {
      const { other } = await seedMixed();

      const answer = await feed(USER_FILTERS, `?accountId=${other.id}`);

      expect(answer.transactions.map((row) => row.payee)).toEqual(['Работа']);
    });

    it('narrows to a kind, and an opening balance is income like any other', async () => {
      await seedMixed();

      const answer = await feed(USER_FILTERS, '?type=INCOME');

      expect(answer.transactions.map((row) => row.isSystem)).toEqual([false, true]);
      expect(answer.transactions.map((row) => row.amount)).toEqual(['500000', '100000']);
    });

    it('narrows to a period, both ends included', async () => {
      await seedMixed();

      const answer = await feed(USER_FILTERS, '?from=2026-07-01&to=2026-07-03');

      expect(answer.transactions.map((row) => row.payee)).toEqual(['Работа', 'Кинотеатр']);
    });

    it('combines two filters as one narrower question', async () => {
      const { account } = await seedMixed();

      const answer = await feed(
        USER_FILTERS,
        `?accountId=${account.id}&from=2026-07-01&to=2026-07-31`,
      );

      expect(answer.transactions.map((row) => row.payee)).toEqual(['Кинотеатр']);
    });

    it('counts only what the filter left when it totals a day', async () => {
      const { second } = await seedMixed();

      const answer = await feed(USER_FILTERS, `?categoryId=${second.id}`);

      expect(answer.days).toEqual([{ date: '2026-07-02', total: '-2000' }]);
    });
  });

  describe('the accounts it covers', () => {
    it('leaves out an archived account when no account was named', async () => {
      const { budget, account, category } = await budgetOf(USER_CLOSED);
      const closed = await harness.seedAccount(USER_CLOSED, budget.id, {
        name: 'Старый счёт',
        createdAt: OPENED,
        archivedAt: new Date('2026-08-01T00:00:00Z'),
      });

      await seedRow(USER_CLOSED, budget.id, account.id, {
        categoryId: category.id,
        payee: 'живой счёт',
      });
      await seedRow(USER_CLOSED, budget.id, closed.id, {
        categoryId: category.id,
        payee: 'закрытый счёт',
      });

      const answer = await feed(USER_CLOSED);

      expect(answer.transactions.map((row) => row.payee)).toEqual(['живой счёт']);
    });
  });

  describe('a transfer in the feed', () => {
    it('names the other account of the pair', async () => {
      const { budget, account } = await budgetOf(USER_PAIRS);
      const other = await harness.seedAccount(USER_PAIRS, budget.id, {
        name: 'Карта',
        createdAt: OPENED,
      });
      const transferId = '0199c1a8-9ecf-71c7-a617-c575df073912';

      await seedRow(USER_PAIRS, budget.id, account.id, {
        amount: -5000n,
        type: TransactionType.TRANSFER,
        transferId,
      });
      await seedRow(USER_PAIRS, budget.id, other.id, {
        amount: 5000n,
        type: TransactionType.TRANSFER,
        transferId,
      });

      const answer = await feed(USER_PAIRS, `?accountId=${account.id}`);

      expect(answer.transactions).toHaveLength(1);
      expect(answer.transactions[0]).toMatchObject({
        type: 'TRANSFER',
        amount: '-5000',
        counterAccountId: other.id,
      });
    });
  });

  describe('the payees it has seen', () => {
    it('answers with each name once, in alphabetical order', async () => {
      const { budget, account, category } = await budgetOf(USER_KNOWN);

      for (const payee of ['Пекарня', 'Аптека', 'Пекарня']) {
        await seedRow(USER_KNOWN, budget.id, account.id, { categoryId: category.id, payee });
      }

      expect(await payeesOf(USER_KNOWN)).toEqual(['Аптека', 'Пекарня']);
    });

    it('leaves out the names no person typed', async () => {
      const { budget, account, category } = await budgetOf(USER_KNOWN);
      const other = await harness.seedAccount(USER_KNOWN, budget.id, {
        name: 'Карта',
        createdAt: OPENED,
      });

      await seedRow(USER_KNOWN, budget.id, account.id, {
        categoryId: category.id,
        payee: 'Аптека',
      });
      await seedRow(USER_KNOWN, budget.id, account.id, {
        amount: 100_000n,
        type: TransactionType.INCOME,
        isSystem: true,
        payee: 'Начальный остаток',
      });
      await seedRow(USER_KNOWN, budget.id, other.id, {
        amount: -5000n,
        type: TransactionType.TRANSFER,
        transferId: '0199c1a8-9ecf-71c7-a617-c575df073913',
        payee: 'Между счетами',
      });

      expect(await payeesOf(USER_KNOWN)).toEqual(['Аптека']);
    });
  });

  describe('a cursor that came from nowhere', () => {
    it('is refused rather than falling over, whatever was typed into it', async () => {
      await budgetOf(USER_PAGES);

      for (const cursor of ['not-base64', Buffer.from('a|b|c').toString('base64url')]) {
        await request(harness.server())
          .get(`/transactions?cursor=${encodeURIComponent(cursor)}`)
          .set('Authorization', `Bearer ${harness.tokenFor(USER_PAGES)}`)
          .expect(400);
      }
    });
  });
});
