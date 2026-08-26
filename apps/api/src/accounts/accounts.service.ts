import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { TransactionType, type Account, type Prisma } from '@rondo/db';
import { isAccountType, parseMoney, toDbDate, todayIn } from '@rondo/types';

import { AccountResponse } from '@/accounts/account.response';
import { CreateAccountDto } from '@/accounts/create-account.dto';
import { MutationService, type MutationClient } from '@/mutations/mutation.service';
import { SCOPED_PRISMA, type ScopedPrismaClient } from '@/prisma/scoped-prisma';

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

@Injectable()
export class AccountsService {
  constructor(
    @Inject(SCOPED_PRISMA) private readonly prisma: ScopedPrismaClient,
    private readonly mutations: MutationService,
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

  async list(userId: string): Promise<AccountResponse[]> {
    await this.activeBudget(this.prisma);

    const accounts = await this.prisma.account.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });

    return accounts.map((account) => decodeAccount(serialize(account)));
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
