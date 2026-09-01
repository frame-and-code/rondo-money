import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { Prisma, type Transaction } from '@rondo/db';
import {
  calendarDateOf,
  parseCalendarDate,
  parseMoney,
  serializeMoney,
  toDbDate,
  todayIn,
  type TransactionRefusal,
} from '@rondo/types';

import { MutationService, type MutationClient } from '@/mutations/mutation.service';
import { SCOPED_PRISMA, type ScopedPrismaClient } from '@/prisma/scoped-prisma';
import { CreateTransactionDto } from '@/transactions/create-transaction.dto';
import { DeleteTransactionDto } from '@/transactions/delete-transaction.dto';
import {
  refuseDraft,
  refuseRemoval,
  refuseSystemEdit,
  refuseTarget,
  signedAmount,
  type EntryCategory,
  type SystemEntry,
} from '@/transactions/entry-rules';
import { ListTransactionsQueryDto, PAGE_SIZE } from '@/transactions/list-transactions.query.dto';
import { decodeTransaction, serializeTransaction } from '@/transactions/transaction-record';
import { TransactionResponse } from '@/transactions/transaction.response';
import { PayeesResponse, TransactionPageResponse } from '@/transactions/transactions.response';
import { UpdateTransactionDto } from '@/transactions/update-transaction.dto';

const NO_ACTIVE_BUDGET =
  'The caller has no active budget, so there is nothing for a record to belong to. Create a ' +
  'budget first.';

const MESSAGES: Record<TransactionRefusal, string> = {
  ACCOUNT_ARCHIVED: 'This account is archived, and an archived account takes no new records.',
  CATEGORY_HIDDEN: 'This category is hidden, and a hidden envelope takes no new money.',
  CATEGORY_REQUIRED: 'An expense names the envelope the money left.',
  DATE_BEFORE_ACCOUNT: 'This day is earlier than the day the account was opened.',
  DATE_IN_FUTURE: 'A record is dated no later than today in the budget timezone.',
  NOT_EDITABLE:
    'This record belongs to the app rather than to a person: an opening balance and a transfer ' +
    'leg are written and removed by their own operations.',
  NO_ACTIVE_BUDGET,
  UNKNOWN_ACCOUNT: 'This budget holds no such account.',
  UNKNOWN_CATEGORY: 'This budget holds no such category.',
  UNKNOWN_TRANSACTION: 'This budget holds no such record.',
};

function refuse(reason: TransactionRefusal): BadRequestException {
  return new BadRequestException({
    statusCode: 400,
    error: 'Bad Request',
    message: MESSAGES[reason],
    reason,
  });
}

interface Counterpart {
  id: string;
  transferId: string | null;
  accountId: string;
}

function counterpartOf(row: Transaction, held: Counterpart[]): string | null {
  if (row.transferId === null) {
    return null;
  }

  const pair = held.find(
    (candidate) => candidate.transferId === row.transferId && candidate.id !== row.id,
  );

  return pair?.accountId ?? null;
}

interface Cursor {
  date: Date;
  createdAt: Date;
  id: string;
}

function encodeCursor(row: Transaction): string {
  return Buffer.from(
    `${calendarDateOf(row.date)}|${row.createdAt.toISOString()}|${row.id}`,
    'utf8',
  ).toString('base64url');
}

function decodeCursor(raw: string): Cursor {
  const [date, createdAt, id] = Buffer.from(raw, 'base64url').toString('utf8').split('|');

  if (date === undefined || createdAt === undefined || id === undefined) {
    throw new BadRequestException('The cursor does not name where the previous page stopped.');
  }

  const written = new Date(createdAt);

  try {
    if (Number.isNaN(written.getTime())) {
      throw new TypeError(`The cursor names no moment: ${createdAt}`);
    }

    return { date: toDbDate(parseCalendarDate(date)), createdAt: written, id };
  } catch {
    throw new BadRequestException('The cursor does not name where the previous page stopped.');
  }
}

@Injectable()
export class TransactionsService {
  constructor(
    @Inject(SCOPED_PRISMA) private readonly prisma: ScopedPrismaClient,
    private readonly mutations: MutationService,
  ) {}

  async create(userId: string, body: CreateTransactionDto): Promise<TransactionResponse> {
    const intended = await this.activeBudget(this.prisma);

    return this.mutations.run(
      {
        key: body.idempotencyKey,
        request: {
          budgetId: intended.id,
          accountId: body.accountId,
          categoryId: body.categoryId ?? null,
          type: body.type,
          amount: body.amount,
          date: body.date,
          payee: body.payee ?? null,
        },
        decode: decodeTransaction,
      },
      async (tx) => {
        const budget = await this.activeBudget(tx, intended.id);
        await this.refuseUnusable(tx, budget, body, null);

        const written = await tx.transaction.create({
          data: {
            userId,
            budgetId: budget.id,
            accountId: body.accountId,
            categoryId: body.categoryId ?? null,
            date: toDbDate(parseCalendarDate(body.date)),
            amount: signedAmount(body.type, parseMoney(body.amount)),
            type: body.type,
            payee: body.payee ?? null,
          },
        });

        return serializeTransaction(written, null);
      },
    );
  }

  async update(id: string, body: UpdateTransactionDto): Promise<TransactionResponse> {
    const intended = await this.activeBudget(this.prisma);

    return this.mutations.run(
      {
        key: body.idempotencyKey,
        request: {
          budgetId: intended.id,
          id,
          accountId: body.accountId,
          categoryId: body.categoryId ?? null,
          type: body.type,
          amount: body.amount,
          date: body.date,
          payee: body.payee ?? null,
        },
        decode: decodeTransaction,
      },
      async (tx) => {
        const budget = await this.activeBudget(tx, intended.id);
        const current = await tx.transaction.findFirst({ where: { id } });
        if (!current) {
          throw refuse('UNKNOWN_TRANSACTION');
        }

        const blocked = refuseTarget(current);
        if (blocked !== null) {
          throw refuse(blocked);
        }

        if (current.isSystem) {
          const held: SystemEntry = {
            accountId: current.accountId,
            categoryId: current.categoryId,
            date: calendarDateOf(current.date),
            payee: current.payee,
            type: current.amount < 0n ? 'EXPENSE' : 'INCOME',
          };
          const wanted = {
            accountId: body.accountId,
            categoryId: body.categoryId ?? null,
            date: parseCalendarDate(body.date),
            payee: body.payee ?? null,
            type: body.type,
          };

          const kept = refuseSystemEdit(held, wanted);
          if (kept !== null) {
            throw refuse(kept);
          }
        } else {
          await this.refuseUnusable(tx, budget, body, current.categoryId);
        }

        const written = await tx.transaction.update({
          where: { id: current.id },
          data: {
            accountId: body.accountId,
            categoryId: body.categoryId ?? null,
            date: toDbDate(parseCalendarDate(body.date)),
            amount: signedAmount(body.type, parseMoney(body.amount)),
            type: body.type,
            payee: body.payee ?? null,
          },
        });

        return serializeTransaction(written, null);
      },
    );
  }

  async remove(id: string, body: DeleteTransactionDto): Promise<TransactionResponse> {
    const intended = await this.activeBudget(this.prisma);

    return this.mutations.run(
      {
        key: body.idempotencyKey,
        request: { budgetId: intended.id, id },
        decode: decodeTransaction,
      },
      async (tx) => {
        await this.activeBudget(tx, intended.id);

        const current = await tx.transaction.findFirst({ where: { id } });
        if (!current) {
          throw refuse('UNKNOWN_TRANSACTION');
        }

        const blocked = refuseRemoval(current);
        if (blocked !== null) {
          throw refuse(blocked);
        }

        await tx.transaction.delete({ where: { id: current.id } });

        return serializeTransaction(current, null);
      },
    );
  }

  async list(userId: string, query: ListTransactionsQueryDto): Promise<TransactionPageResponse> {
    const budget = await this.activeBudget(this.prisma);
    const limit = query.limit ?? PAGE_SIZE;
    const filter = this.filterOf(userId, budget.id, query);

    const found = await this.prisma.transaction.findMany({
      where:
        query.cursor === undefined
          ? filter
          : { AND: [filter, olderThan(decodeCursor(query.cursor))] },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    const page = found.slice(0, limit);
    const last = page.at(-1);
    const counterparts = await this.counterpartsOf(page);

    return {
      transactions: page.map((row) =>
        decodeTransaction(serializeTransaction(row, counterpartOf(row, counterparts))),
      ),
      days: await this.totalsOf(page, filter),
      nextCursor: found.length > limit && last ? encodeCursor(last) : null,
    };
  }

  async payees(userId: string): Promise<PayeesResponse> {
    const budget = await this.activeBudget(this.prisma);

    const found = await this.prisma.transaction.groupBy({
      by: ['payee'],
      where: {
        userId,
        budgetId: budget.id,
        payee: { not: null },
        isSystem: false,
        transferId: null,
      },
      orderBy: { payee: 'asc' },
    });

    return { payees: found.flatMap((row) => (row.payee === null ? [] : [row.payee])) };
  }

  private filterOf(
    userId: string,
    budgetId: string,
    query: ListTransactionsQueryDto,
  ): Prisma.TransactionWhereInput {
    return {
      userId,
      budgetId,
      ...(query.accountId === undefined
        ? { account: { archivedAt: null } }
        : { accountId: query.accountId }),
      ...(query.categoryId === undefined ? {} : { categoryId: query.categoryId }),
      ...(query.payee === undefined ? {} : { payee: query.payee }),
      ...(query.type === undefined ? {} : { type: query.type }),
      ...(query.from === undefined && query.to === undefined
        ? {}
        : {
            date: {
              ...(query.from === undefined ? {} : { gte: toDbDate(parseCalendarDate(query.from)) }),
              ...(query.to === undefined ? {} : { lte: toDbDate(parseCalendarDate(query.to)) }),
            },
          }),
    };
  }

  private async counterpartsOf(page: Transaction[]): Promise<Counterpart[]> {
    const legs = page.flatMap((row) => (row.transferId === null ? [] : [row.transferId]));
    if (legs.length === 0) {
      return [];
    }

    return this.prisma.transaction.findMany({
      where: { transferId: { in: legs } },
      select: { id: true, transferId: true, accountId: true },
    });
  }

  private async totalsOf(
    page: Transaction[],
    filter: Prisma.TransactionWhereInput,
  ): Promise<{ date: string; total: string }[]> {
    const last = page.at(-1);
    const first = page.at(0);
    if (!first || !last) {
      return [];
    }

    const totals = await this.prisma.transaction.groupBy({
      by: ['date'],
      where: { ...filter, date: { gte: last.date, lte: first.date } },
      _sum: { amount: true },
      orderBy: { date: 'desc' },
    });

    return totals.map((row) => ({
      date: calendarDateOf(row.date),
      total: serializeMoney(row._sum.amount ?? 0n),
    }));
  }

  private async refuseUnusable(
    tx: MutationClient,
    budget: { id: string; timezone: string },
    body: CreateTransactionDto,
    heldCategoryId: string | null,
  ): Promise<void> {
    const account = await tx.account.findFirst({ where: { id: body.accountId } });
    if (!account) {
      throw refuse('UNKNOWN_ACCOUNT');
    }

    let category: EntryCategory | null = null;
    if (body.categoryId !== undefined) {
      const found = await tx.category.findFirst({ where: { id: body.categoryId } });
      if (!found) {
        throw refuse('UNKNOWN_CATEGORY');
      }

      category = found;
    }

    const blocked = refuseDraft(
      {
        type: body.type,
        date: parseCalendarDate(body.date),
        account,
        category,
        categoryChanged: (body.categoryId ?? null) !== heldCategoryId,
      },
      { timezone: budget.timezone, today: todayIn(budget.timezone) },
    );

    if (blocked !== null) {
      throw refuse(blocked);
    }
  }

  private async activeBudget(
    client: MutationClient | ScopedPrismaClient,
    id?: string,
  ): Promise<{ id: string; timezone: string }> {
    const budget = await client.budget.findFirst({
      where: { active: true, ...(id ? { id } : {}) },
    });
    if (!budget) {
      throw refuse('NO_ACTIVE_BUDGET');
    }

    return budget;
  }
}

function olderThan(cursor: Cursor): Prisma.TransactionWhereInput {
  return {
    OR: [
      { date: { lt: cursor.date } },
      { date: cursor.date, createdAt: { lt: cursor.createdAt } },
      { date: cursor.date, createdAt: cursor.createdAt, id: { lt: cursor.id } },
    ],
  };
}
