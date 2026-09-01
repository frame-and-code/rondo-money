import { randomUUID } from 'node:crypto';

import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { Prisma, type Transaction } from '@rondo/db';
import {
  parseCalendarDate,
  parseMoney,
  toDbDate,
  todayIn,
  type Money,
  type TransferRefusal,
} from '@rondo/types';

import { MutationService, type MutationClient } from '@/mutations/mutation.service';
import { SCOPED_PRISMA, type ScopedPrismaClient } from '@/prisma/scoped-prisma';
import { decodeTransaction, serializeTransaction } from '@/transactions/transaction-record';
import { CreateTransferDto } from '@/transfers/create-transfer.dto';
import { DeleteTransferDto } from '@/transfers/delete-transfer.dto';
import { inLegWriteOrder, refuseTransfer, type TransferAccount } from '@/transfers/transfer-rules';
import { TransferResponse } from '@/transfers/transfer.response';
import { UpdateTransferDto } from '@/transfers/update-transfer.dto';

const MESSAGES: Record<TransferRefusal, string> = {
  ACCOUNT_ARCHIVED:
    'One of the two accounts is archived, and a transfer needs both of its ends open. Its own ' +
    'balance would move with nobody able to correct it.',
  DATE_BEFORE_ACCOUNT: 'This day is earlier than the day the later of the two accounts was opened.',
  DATE_IN_FUTURE: 'A transfer is dated no later than today in the budget timezone.',
  NO_ACTIVE_BUDGET:
    'The caller has no active budget, so there are no accounts to move money between. Create a ' +
    'budget first.',
  SAME_ACCOUNT: 'A transfer names two different accounts, or the money arrives where it left from.',
  UNKNOWN_ACCOUNT: 'This budget holds no such account.',
  UNKNOWN_TRANSFER: 'This budget holds no such transfer.',
};

function refuse(reason: TransferRefusal): BadRequestException {
  return new BadRequestException({
    statusCode: 400,
    error: 'Bad Request',
    message: MESSAGES[reason],
    reason,
  });
}

interface Pair {
  outgoing: Transaction;
  incoming: Transaction;
}

function pairOf(transferId: string, legs: Transaction[]): Pair {
  const outgoing = legs.find((leg) => leg.amount < 0n);
  const incoming = legs.find((leg) => leg.amount > 0n);

  if (legs.length !== 2 || !outgoing || !incoming) {
    throw new Error(
      `The transfer ${transferId} is not a pair: ${legs.length} legs carry its identifier, and ` +
        'a transfer is written and removed as two',
    );
  }

  return { outgoing, incoming };
}

function serializeTransfer(transferId: string, pair: Pair): Prisma.JsonObject {
  return {
    transferId,
    from: serializeTransaction(pair.outgoing, pair.incoming.accountId),
    to: serializeTransaction(pair.incoming, pair.outgoing.accountId),
  };
}

function decodeTransfer(stored: Prisma.JsonValue): TransferResponse {
  if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) {
    throw new Error(`A stored transfer is not an object: ${JSON.stringify(stored)}`);
  }

  const { transferId, from, to } = stored;

  if (typeof transferId !== 'string' || from === undefined || to === undefined) {
    throw new Error(`A stored transfer is missing fields: ${JSON.stringify(stored)}`);
  }

  return {
    transferId,
    from: decodeTransaction(from ?? null),
    to: decodeTransaction(to ?? null),
  };
}

@Injectable()
export class TransfersService {
  constructor(
    @Inject(SCOPED_PRISMA) private readonly prisma: ScopedPrismaClient,
    private readonly mutations: MutationService,
  ) {}

  async create(userId: string, body: CreateTransferDto): Promise<TransferResponse> {
    const intended = await this.activeBudget(this.prisma);

    return this.mutations.run(
      {
        key: body.idempotencyKey,
        request: {
          budgetId: intended.id,
          fromAccountId: body.fromAccountId,
          toAccountId: body.toAccountId,
          amount: body.amount,
          date: body.date,
        },
        decode: decodeTransfer,
      },
      async (tx) => {
        const budget = await this.activeBudget(tx, intended.id);
        await this.refuseUnusable(tx, budget, body);

        const transferId = randomUUID();
        const amount = parseMoney(body.amount);
        const date = toDbDate(parseCalendarDate(body.date));

        const leg = (accountId: string, signed: Money): Promise<Transaction> =>
          tx.transaction.create({
            data: {
              userId,
              budgetId: budget.id,
              accountId,
              categoryId: null,
              date,
              amount: signed,
              type: 'TRANSFER',
              transferId,
              payee: null,
            },
          });

        const outgoing = await leg(body.fromAccountId, -amount);
        const incoming = await leg(body.toAccountId, amount);

        return serializeTransfer(transferId, { outgoing, incoming });
      },
    );
  }

  async update(transferId: string, body: UpdateTransferDto): Promise<TransferResponse> {
    const intended = await this.activeBudget(this.prisma);

    return this.mutations.run(
      {
        key: body.idempotencyKey,
        request: {
          budgetId: intended.id,
          transferId,
          fromAccountId: body.fromAccountId,
          toAccountId: body.toAccountId,
          amount: body.amount,
          date: body.date,
        },
        decode: decodeTransfer,
      },
      async (tx) => {
        const budget = await this.activeBudget(tx, intended.id);
        const held = await this.pairHeld(tx, transferId);

        await this.refuseUnusable(tx, budget, body);

        const amount = parseMoney(body.amount);
        const date = toDbDate(parseCalendarDate(body.date));
        const wanted = new Map<string, { accountId: string; amount: Money }>([
          [held.outgoing.id, { accountId: body.fromAccountId, amount: -amount }],
          [held.incoming.id, { accountId: body.toAccountId, amount }],
        ]);

        const written: Transaction[] = [];
        for (const leg of inLegWriteOrder([held.outgoing, held.incoming])) {
          const next = wanted.get(leg.id);
          if (!next) {
            throw new Error(`The leg ${leg.id} belongs to no side of the transfer ${transferId}`);
          }

          written.push(
            await tx.transaction.update({
              where: { id: leg.id },
              data: { accountId: next.accountId, amount: next.amount, date },
            }),
          );
        }

        return serializeTransfer(transferId, pairOf(transferId, written));
      },
    );
  }

  async remove(transferId: string, body: DeleteTransferDto): Promise<TransferResponse> {
    const intended = await this.activeBudget(this.prisma);

    return this.mutations.run(
      {
        key: body.idempotencyKey,
        request: { budgetId: intended.id, transferId },
        decode: decodeTransfer,
      },
      async (tx) => {
        await this.activeBudget(tx, intended.id);
        const held = await this.pairHeld(tx, transferId);

        for (const leg of inLegWriteOrder([held.outgoing, held.incoming])) {
          await tx.transaction.delete({ where: { id: leg.id } });
        }

        return serializeTransfer(transferId, held);
      },
    );
  }

  private async pairHeld(tx: MutationClient, transferId: string): Promise<Pair> {
    const legs = await tx.transaction.findMany({ where: { transferId } });
    if (legs.length === 0) {
      throw refuse('UNKNOWN_TRANSFER');
    }

    const held = pairOf(transferId, legs);
    const accounts = await tx.account.findMany({
      where: { id: { in: [held.outgoing.accountId, held.incoming.accountId] } },
    });

    if (accounts.some((account) => account.archivedAt !== null)) {
      throw refuse('ACCOUNT_ARCHIVED');
    }

    return held;
  }

  private async refuseUnusable(
    tx: MutationClient,
    budget: { id: string; timezone: string },
    body: CreateTransferDto,
  ): Promise<void> {
    const from = await this.accountHeld(tx, body.fromAccountId);
    const to =
      body.toAccountId === body.fromAccountId ? from : await this.accountHeld(tx, body.toAccountId);

    const blocked = refuseTransfer(
      { from, to, date: parseCalendarDate(body.date) },
      { timezone: budget.timezone, today: todayIn(budget.timezone) },
    );

    if (blocked !== null) {
      throw refuse(blocked);
    }
  }

  private async accountHeld(tx: MutationClient, id: string): Promise<TransferAccount> {
    const account = await tx.account.findFirst({ where: { id } });
    if (!account) {
      throw refuse('UNKNOWN_ACCOUNT');
    }

    return account;
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
