import { BadRequestException } from '@nestjs/common';
import { type Prisma } from '@rondo/db';

import { type BudgetViewRow } from '@/budget-view/budget-view.query';
import { BudgetViewService } from '@/budget-view/budget-view.service';
import { type ScopedPrismaClient } from '@/prisma/scoped-prisma';
import { type RawQueryScope, type ScopedRawRepository } from '@/raw-sql/scoped-raw.repository';

const USER = 'user_2rondoViewUnitAaaaaaaaaaa';
const BUDGET = { id: '0199c1a8-9ecf-71c7-a617-c575df073700', timezone: 'Europe/Warsaw' };

const row = (over: Partial<BudgetViewRow> = {}): BudgetViewRow => ({
  readyToAssign: 100n,
  groupId: null,
  groupName: null,
  categoryId: null,
  categoryName: null,
  categoryIcon: null,
  categoryColor: null,
  groupHidden: false,
  categoryHidden: false,
  paid: false,
  availableAllTime: 0n,
  assigned: 0n,
  activity: 0n,
  available: 0n,
  targetKind: null,
  targetAmount: null,
  targetStartMonth: null,
  targetDueMonth: null,
  targetFunded: null,
  targetAssignedBefore: null,
  targetActivityBefore: null,
  ...over,
});

function serviceReading(
  rows: BudgetViewRow[],
  budget: { id: string; timezone: string } | null = BUDGET,
): { service: BudgetViewService; statements: Prisma.Sql[] } {
  const statements: Prisma.Sql[] = [];

  const prisma = {
    budget: { findFirst: () => Promise.resolve(budget) },
  } as unknown as ScopedPrismaClient;

  const raw = {
    query: <T>(build: (scope: RawQueryScope) => Prisma.Sql): Promise<T[]> => {
      statements.push(build({ userId: USER }));
      return Promise.resolve(rows as T[]);
    },
  } as unknown as ScopedRawRepository;

  return { service: new BudgetViewService(prisma, raw), statements };
}

describe('BudgetViewService', () => {
  it('assembles the rows into groups, keeping the order the statement returned them in', async () => {
    const { service } = serviceReading([
      row({
        groupId: 'g1',
        groupName: 'Дом',
        categoryId: 'c1',
        categoryName: 'Аренда',
        assigned: 7_000n,
        activity: -2_500n,
        available: 4_500n,
        availableAllTime: 4_500n,
      }),
      row({ groupId: 'g1', groupName: 'Дом', categoryId: 'c2', categoryName: 'Еда' }),
      row({ groupId: 'g2', groupName: 'Пустая' }),
    ]);

    const view = await service.read(USER, '2026-02');

    expect(view).toEqual({
      month: '2026-02',
      readyToAssign: '100',
      groups: [
        {
          id: 'g1',
          name: 'Дом',
          hidden: false,
          categories: [
            {
              id: 'c1',
              name: 'Аренда',
              icon: null,
              color: null,
              assigned: '7000',
              activity: '-2500',
              available: '4500',
              availableAllTime: '4500',
              hidden: false,
              paid: false,
              target: null,
            },
            {
              id: 'c2',
              name: 'Еда',
              icon: null,
              color: null,
              assigned: '0',
              activity: '0',
              available: '0',
              availableAllTime: '0',
              hidden: false,
              paid: false,
              target: null,
            },
          ],
        },
        { id: 'g2', name: 'Пустая', hidden: false, categories: [] },
      ],
    });
  });

  it('answers a budget with no groups at all with the pool and nothing else', async () => {
    const { service } = serviceReading([row({ readyToAssign: -4_200n })]);

    expect(await service.read(USER, '2026-02')).toEqual({
      month: '2026-02',
      readyToAssign: '-4200',
      groups: [],
    });
  });

  it('bounds the month with calendar dates and the visibility with an instant of that zone', async () => {
    const { service, statements } = serviceReading([row()]);

    await service.read(USER, '2026-02');

    const [statement] = statements;
    expect(statement?.values).toContain('2026-02-01');
    expect(statement?.values).toContain('2026-03-01');
    expect(statement?.values).toContainEqual(new Date('2026-02-28T23:00:00Z'));
  });

  it('refuses a caller with no active budget, before any statement is built', async () => {
    const { service, statements } = serviceReading([row()], null);

    await expect(service.read(USER, '2026-02')).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.read(USER, '2026-02')).rejects.toThrow(/no active budget/i);
    expect(statements).toEqual([]);
  });

  it('says so when the statement answers with no rows, rather than showing an empty screen', async () => {
    const { service } = serviceReading([]);

    await expect(service.read(USER, '2026-02')).rejects.toThrow(/at least one/i);
  });

  it('skips a row that names a group or a category without naming it', async () => {
    const { service } = serviceReading([
      row({ groupId: 'g1', groupName: null }),
      row({ groupId: 'g2', groupName: 'Дом', categoryId: 'c1', categoryName: null }),
    ]);

    expect((await service.read(USER, '2026-02')).groups).toEqual([
      { id: 'g2', name: 'Дом', hidden: false, categories: [] },
    ]);
  });
});

describe('the look a category is drawn with', () => {
  it('carries the icon and the colour the row holds through to the response', async () => {
    const { service } = serviceReading([
      row({
        groupId: 'g1',
        groupName: 'Дом',
        categoryId: 'c1',
        categoryName: 'Жильё',
        categoryIcon: 'home',
        categoryColor: 'blue',
      }),
    ]);

    const view = await service.read(USER, '2026-02');

    expect(view.groups[0]?.categories[0]).toMatchObject({ icon: 'home', color: 'blue' });
  });

  it('answers with no look for a category that was never given one', async () => {
    const { service } = serviceReading([
      row({
        groupId: 'g1',
        groupName: 'Дом',
        categoryId: 'c1',
        categoryName: 'Жильё',
        categoryIcon: null,
        categoryColor: null,
      }),
    ]);

    const view = await service.read(USER, '2026-02');

    expect(view.groups[0]?.categories[0]).toMatchObject({ icon: null, color: null });
  });

  it('reads a stored name this app cannot draw as no look, rather than passing it on', async () => {
    const { service } = serviceReading([
      row({
        groupId: 'g1',
        groupName: 'Дом',
        categoryId: 'c1',
        categoryName: 'Жильё',
        categoryIcon: 'rocket',
        categoryColor: '#ff0000',
      }),
    ]);

    const view = await service.read(USER, '2026-02');

    expect(view.groups[0]?.categories[0]).toMatchObject({ icon: null, color: null });
  });
});
