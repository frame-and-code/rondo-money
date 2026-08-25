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
  assigned: 0n,
  activity: 0n,
  available: 0n,
  ...over,
});

/// The statement the service builds, captured rather than executed: the repository is the seam
/// where the caller's scope arrives, so a fake one can hand in a scope and read back what the
/// service asked for.
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
          categories: [
            { id: 'c1', name: 'Аренда', assigned: '7000', activity: '-2500', available: '4500' },
            { id: 'c2', name: 'Еда', assigned: '0', activity: '0', available: '0' },
          ],
        },
        { id: 'g2', name: 'Пустая', categories: [] },
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
    // Midnight on 1 March in Warsaw, which is still 28 February in UTC.
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
      { id: 'g2', name: 'Дом', categories: [] },
    ]);
  });
});
