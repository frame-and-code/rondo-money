import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { TransactionType, type Account, type Prisma } from '@rondo/db';
import { isAccountType, parseMoney, serializeMoney, toDbDate, todayIn } from '@rondo/types';

import {
  accountBalancesStatement,
  type AccountBalanceRow,
} from '@/accounts/account-balances.query';
import { AccountResponse } from '@/accounts/account.response';
import { AccountBalanceResponse, AccountsResponse } from '@/accounts/accounts.response';
import { CreateAccountDto } from '@/accounts/create-account.dto';
import { RenameAccountDto } from '@/accounts/rename-account.dto';
import { MutationService, type MutationClient } from '@/mutations/mutation.service';
import { SCOPED_PRISMA, type ScopedPrismaClient } from '@/prisma/scoped-prisma';
import { ScopedRawRepository } from '@/raw-sql/scoped-raw.repository';

const NO_ACTIVE_BUDGET =
  'The caller has no active budget, so there is nothing for an account to belong to. Create ' +
  'a budget first.';

function serialize(account: Account): Prisma.JsonObject {
  return { id: account.id, name: account.name, type: account.type };
}

function decodeAccount(stored: Prisma.JsonValue): AccountResponse {
  if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) {
    throw new Error(`A stored account is not an object: ${JSON.stringify(stored)}`);
  }

  const { id, name, type } = stored;
  if (typeof id !== 'string' || typeof name !== 'string' || !isAccountType(type)) {
    throw new Error(`A stored account is missing fields: ${JSON.stringify(stored)}`);
  }

  return { id, name, type };
}

function listed(row: AccountBalanceRow, userId: string): AccountBalanceResponse {
  const { accountId, name, type } = row;
  if (accountId === null || name === null || !isAccountType(type)) {
    throw new Error(
      `An account of ${userId} came back from the balances statement without the fields every ` +
        `listed row carries: ${JSON.stringify({ accountId, name, type })}`,
    );
  }

  return { id: accountId, name, type, balance: serializeMoney(row.balance) };
}

@Injectable()
export class AccountsService {
  constructor(
    @Inject(SCOPED_PRISMA) private readonly prisma: ScopedPrismaClient,
    private readonly mutations: MutationService,
    private readonly raw: ScopedRawRepository,
  ) {}

  async create(userId: string, body: CreateAccountDto): Promise<AccountResponse> {
    const intended = await this.activeBudget(this.prisma);

    return this.mutations.run(
      {
        key: body.idempotencyKey,
        request: {
          budgetId: intended.id,
          name: body.name,
          type: body.type,
          initialBalance: body.initialBalance,
        },
        decode: decodeAccount,
      },
      async (tx) => {
        const budget = await this.activeBudget(tx, intended.id);

        const account = await tx.account.create({
          data: { userId, budgetId: budget.id, name: body.name, type: body.type },
        });

        await tx.transaction.create({
          data: {
            userId,
            budgetId: budget.id,
            accountId: account.id,
            date: toDbDate(todayIn(budget.timezone)),
            amount: parseMoney(body.initialBalance),
            type: TransactionType.INCOME,
            isSystem: true,
          },
        });

        return serialize(account);
      },
    );
  }

  async list(userId: string): Promise<AccountsResponse> {
    const budget = await this.activeBudget(this.prisma);

    const rows = await this.raw.query<AccountBalanceRow>((scope) =>
      accountBalancesStatement(scope, budget.id),
    );

    const [pool] = rows;
    if (!pool) {
      throw new Error(
        'The account balances statement answered with no rows: it always returns at least one, ' +
          'carrying the total, so an empty answer means the statement no longer starts from it.',
      );
    }

    return {
      accounts: rows.flatMap((row) => (row.accountId === null ? [] : [listed(row, userId)])),
      total: serializeMoney(pool.total),
    };
  }

  async rename(id: string, body: RenameAccountDto): Promise<AccountResponse> {
    const intended = await this.activeBudget(this.prisma);

    return this.mutations.run(
      {
        key: body.idempotencyKey,
        request: { budgetId: intended.id, id, name: body.name },
        decode: decodeAccount,
      },
      async (tx) => {
        await this.activeBudget(tx, intended.id);

        const current = await tx.account.findFirst({ where: { id } });
        if (!current) {
          throw new BadRequestException(`This budget holds no account ${id}.`);
        }

        return serialize(
          await tx.account.update({ where: { id: current.id }, data: { name: body.name } }),
        );
      },
    );
  }

  private async activeBudget(
    client: MutationClient | ScopedPrismaClient,
    id?: string,
  ): Promise<{ id: string; timezone: string }> {
    const budget = await client.budget.findFirst({
      where: { active: true, ...(id ? { id } : {}) },
    });
    if (!budget) {
      throw new BadRequestException(NO_ACTIVE_BUDGET);
    }

    return budget;
  }
}
