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

/// Runs on the fresh path and on the replay alike, so a stored result cannot drift from a
/// fresh one. It narrows rather than casts: the row is `JsonValue`, and a cast would promise
/// the caller a shape the row may not carry.
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
    // Resolved before the mutation opens so that the budget can join the intent. Without it a
    // key replayed after the caller switched budgets answers with the account it made in the
    // old one, having written nothing in the new.
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

        // PRD 7.2: the opening balance is a transaction and not a field on the account, so it
        // stays correctable later. It is written even at zero, because nothing creates it a
        // second time and an account without it would have no opening balance ever.
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

  /// Asked before anything reads a model a budget owns. The scoping extension refuses such a
  /// read without one, and what it raises is an internal error rather than an answer, so the
  /// caller would see a 500 for an ordinary state: a user part way through onboarding.
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
