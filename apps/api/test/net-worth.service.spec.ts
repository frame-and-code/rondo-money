import { BadRequestException } from '@nestjs/common';
import { type Prisma } from '@rondo/db';

import { type NetWorthRow } from '@/net-worth/net-worth.query';
import { NetWorthService } from '@/net-worth/net-worth.service';
import { type ScopedPrismaClient } from '@/prisma/scoped-prisma';
import { type RawQueryScope, type ScopedRawRepository } from '@/raw-sql/scoped-raw.repository';

const USER = 'user_2rondoNetWorthUnitAaaaaaa';
const BUDGET = { id: '0199c1a8-9ecf-71c7-a617-c575df073930', timezone: 'Europe/Warsaw' };

const totals = { accountsTotal: 30_000n, assetsTotal: 500_000n, liabilitiesTotal: 120_000n };

const row = (over: Partial<NetWorthRow> = {}): NetWorthRow => ({
  total: 0n,
  accountsTotal: 0n,
  assetsTotal: 0n,
  liabilitiesTotal: 0n,
  kind: null,
  id: null,
  name: null,
  type: null,
  amount: null,
  day: null,
  ...over,
});

function serviceReading(
  rows: NetWorthRow[],
  budget: { id: string; timezone: string } | null = BUDGET,
): { service: NetWorthService; statements: Prisma.Sql[] } {
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

  return { service: new NetWorthService(prisma, raw), statements };
}

describe('NetWorthService reading what the caller is worth', () => {
  it('sorts the rows into three lists, in the order the statement returned them', async () => {
    const whole = { ...totals, total: 410_000n };
    const { service } = serviceReading([
      row({ ...whole, kind: 'account', id: 'a1', name: 'Кошелёк', type: 'CASH', amount: -5_000n }),
      row({ ...whole, kind: 'account', id: 'a2', name: 'Карта', type: 'DEBIT', amount: 35_000n }),
      row({
        ...whole,
        kind: 'asset',
        id: 's1',
        name: 'Квартира',
        amount: 500_000n,
        day: '2026-03-12',
      }),
      row({ ...whole, kind: 'liability', id: 'l1', name: 'Ипотека', amount: 100_000n }),
      row({
        ...whole,
        kind: 'liability',
        id: 'l2',
        name: 'Долг',
        amount: 20_000n,
        day: '2026-08-15',
      }),
    ]);

    await expect(service.read()).resolves.toEqual({
      total: '410000',
      accountsTotal: '30000',
      assetsTotal: '500000',
      liabilitiesTotal: '120000',
      accounts: [
        { id: 'a1', name: 'Кошелёк', type: 'CASH', balance: '-5000' },
        { id: 'a2', name: 'Карта', type: 'DEBIT', balance: '35000' },
      ],
      assets: [{ id: 's1', name: 'Квартира', amount: '500000', date: '2026-03-12' }],
      liabilities: [
        { id: 'l1', name: 'Ипотека', amount: '100000', date: null },
        { id: 'l2', name: 'Долг', amount: '20000', date: '2026-08-15' },
      ],
    });
  });

  it('answers a budget holding nothing with three empty lists and four amounts of nothing', async () => {
    const { service } = serviceReading([row()]);

    await expect(service.read()).resolves.toEqual({
      total: '0',
      accountsTotal: '0',
      assetsTotal: '0',
      liabilitiesTotal: '0',
      accounts: [],
      assets: [],
      liabilities: [],
    });
  });

  it('carries a total below zero through rather than clamping it', async () => {
    const { service } = serviceReading([
      row({
        total: -70_000n,
        liabilitiesTotal: 70_000n,
        kind: 'liability',
        id: 'l1',
        name: 'Долг',
        amount: 70_000n,
      }),
    ]);

    await expect(service.read()).resolves.toMatchObject({ total: '-70000' });
  });

  it('says so when the statement answers with no rows, rather than reporting an empty budget', async () => {
    const { service } = serviceReading([]);

    await expect(service.read()).rejects.toThrow(/at least one/i);
  });

  it.each([
    ['an account with no type', row({ kind: 'account', id: 'a1', name: 'Кошелёк', amount: 1n })],
    ['an asset with no amount', row({ kind: 'asset', id: 's1', name: 'Квартира' })],
    ['a liability with no name', row({ kind: 'liability', id: 'l1', amount: 1n })],
    ['a row of a kind nobody knows', row({ kind: 'pension', id: 'p1', name: 'Фонд', amount: 1n })],
  ])('refuses %s, and names the kind it could not read', async (_what, broken) => {
    const { service } = serviceReading([broken]);

    await expect(service.read()).rejects.toThrow(new RegExp(String(broken.kind)));
  });

  it('refuses a caller with no active budget, before any statement is built', async () => {
    const { service, statements } = serviceReading([row()], null);

    await expect(service.read()).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.read()).rejects.toMatchObject({
      response: { reason: 'NO_ACTIVE_BUDGET' },
    });
    expect(statements).toEqual([]);
  });
});
