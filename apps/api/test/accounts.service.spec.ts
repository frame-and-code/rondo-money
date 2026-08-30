import { BadRequestException } from '@nestjs/common';
import { type Prisma } from '@rondo/db';

import { type AccountBalanceRow } from '@/accounts/account-balances.query';
import { AccountsService } from '@/accounts/accounts.service';
import { type MutationService } from '@/mutations/mutation.service';
import { type ScopedPrismaClient } from '@/prisma/scoped-prisma';
import { type RawQueryScope, type ScopedRawRepository } from '@/raw-sql/scoped-raw.repository';

const USER = 'user_2rondoAccountUnitAaaaaaaa';
const BUDGET = { id: '0199c1a8-9ecf-71c7-a617-c575df073910', timezone: 'Europe/Warsaw' };

const row = (over: Partial<AccountBalanceRow> = {}): AccountBalanceRow => ({
  total: 0n,
  accountId: null,
  name: null,
  type: null,
  balance: 0n,
  ...over,
});

function serviceReading(
  rows: AccountBalanceRow[],
  budget: { id: string; timezone: string } | null = BUDGET,
): { service: AccountsService; statements: Prisma.Sql[] } {
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

  const mutations = {} as unknown as MutationService;

  return { service: new AccountsService(prisma, mutations, raw), statements };
}

describe('AccountsService reading the accounts', () => {
  it('answers with minor units as strings, in the order the statement returned them', async () => {
    const { service } = serviceReading([
      row({ total: 125_050n, accountId: 'a1', name: 'Кошелёк', type: 'CASH', balance: 25_050n }),
      row({ total: 125_050n, accountId: 'a2', name: 'Карта', type: 'DEBIT', balance: 100_000n }),
    ]);

    await expect(service.list(USER)).resolves.toEqual({
      accounts: [
        { id: 'a1', name: 'Кошелёк', type: 'CASH', balance: '25050' },
        { id: 'a2', name: 'Карта', type: 'DEBIT', balance: '100000' },
      ],
      total: '125050',
    });
  });

  it('answers a budget holding no accounts with an empty list and a total of nothing', async () => {
    const { service } = serviceReading([row()]);

    await expect(service.list(USER)).resolves.toEqual({ accounts: [], total: '0' });
  });

  it('carries a balance below zero through rather than clamping it', async () => {
    const { service } = serviceReading([
      row({ total: -4_000n, accountId: 'a1', name: 'Кошелёк', type: 'CASH', balance: -4_000n }),
    ]);

    await expect(service.list(USER)).resolves.toMatchObject({
      accounts: [{ balance: '-4000' }],
      total: '-4000',
    });
  });

  it('refuses a caller with no active budget, before any statement is built', async () => {
    const { service, statements } = serviceReading([row()], null);

    await expect(service.list(USER)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.list(USER)).rejects.toThrow(/no active budget/i);
    expect(statements).toEqual([]);
  });

  it('says so when the statement answers with no rows, rather than reporting an empty budget', async () => {
    const { service } = serviceReading([]);

    await expect(service.list(USER)).rejects.toThrow(/at least one/i);
  });
});
