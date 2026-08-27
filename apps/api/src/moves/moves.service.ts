import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { type Prisma } from '@rondo/db';
import {
  isMoveSideKind,
  type MoveRefusal,
  parseCalendarMonth,
  parseMoney,
  serializeMoney,
  toDbMonth,
  type Money,
} from '@rondo/types';

import { CreateMoveDto, MoveSideDto } from '@/moves/create-move.dto';
import { MoveResponse, MoveSideResponse } from '@/moves/move.response';
import { MutationService, type MutationClient } from '@/mutations/mutation.service';
import { SCOPED_PRISMA, type ScopedPrismaClient } from '@/prisma/scoped-prisma';

const NO_ACTIVE_BUDGET =
  'The caller has no active budget, so there are no envelopes to move money between. Create ' +
  'a budget first.';

function refuse(reason: MoveRefusal, message: string): BadRequestException {
  return new BadRequestException({ statusCode: 400, error: 'Bad Request', message, reason });
}

const POOL = null;

type Envelope = string | typeof POOL;

function envelopeOf(side: MoveSideDto): Envelope {
  if (side.kind !== 'CATEGORY') {
    return POOL;
  }

  if (side.categoryId === undefined) {
    throw refuse('UNKNOWN_CATEGORY', 'A category side names no category.');
  }

  return side.categoryId;
}

function sideJson(side: MoveSideDto): Prisma.JsonObject {
  return side.kind === 'CATEGORY' && side.categoryId !== undefined
    ? { kind: side.kind, categoryId: side.categoryId }
    : { kind: side.kind };
}

function decodeSide(stored: Prisma.JsonValue): MoveSideResponse {
  if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) {
    throw new Error(`A stored move side is not an object: ${JSON.stringify(stored)}`);
  }

  const { kind, categoryId } = stored;
  if (!isMoveSideKind(kind)) {
    throw new Error(`A stored move side names no envelope: ${JSON.stringify(stored)}`);
  }

  if (categoryId === undefined || categoryId === null) {
    return { kind };
  }

  if (typeof categoryId !== 'string') {
    throw new Error(`A stored move side carries no category id: ${JSON.stringify(stored)}`);
  }

  return { kind, categoryId };
}

function decodeMove(stored: Prisma.JsonValue): MoveResponse {
  if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) {
    throw new Error(`A stored move is not an object: ${JSON.stringify(stored)}`);
  }

  const { month, amount, from, to } = stored;
  if (typeof month !== 'string' || typeof amount !== 'string') {
    throw new Error(`A stored move is missing fields: ${JSON.stringify(stored)}`);
  }

  return {
    month: parseCalendarMonth(month),
    amount,
    from: decodeSide(from ?? null),
    to: decodeSide(to ?? null),
  };
}

interface CategoryMove {
  categoryId: string;
  delta: Money;
}

function inLockOrder(sides: readonly { categoryId: Envelope; delta: Money }[]): CategoryMove[] {
  return sides
    .flatMap(({ categoryId, delta }) => (categoryId === POOL ? [] : [{ categoryId, delta }]))
    .sort((left, right) => (left.categoryId < right.categoryId ? -1 : 1));
}

@Injectable()
export class MovesService {
  constructor(
    @Inject(SCOPED_PRISMA) private readonly prisma: ScopedPrismaClient,
    private readonly mutations: MutationService,
  ) {}

  async move(userId: string, body: CreateMoveDto): Promise<MoveResponse> {
    const month = parseCalendarMonth(body.month);
    const amount = parseMoney(body.amount);

    const from = envelopeOf(body.from);
    const to = envelopeOf(body.to);
    if (from === to) {
      throw refuse(
        'SAME_ENVELOPE',
        'The two sides of a move are the same envelope, so the money would arrive where it ' +
          'left from.',
      );
    }

    const intended = await this.activeBudget(this.prisma);

    return this.mutations.run(
      {
        key: body.idempotencyKey,
        request: {
          budgetId: intended.id,
          month,
          amount: serializeMoney(amount),
          from: sideJson(body.from),
          to: sideJson(body.to),
        },
        decode: decodeMove,
      },
      async (tx) => {
        const budget = await this.activeBudget(tx, intended.id);

        const moves = inLockOrder([
          { categoryId: from, delta: -amount },
          { categoryId: to, delta: amount },
        ]);

        await this.refuseUnusableCategories(tx, moves);

        for (const { categoryId, delta } of moves) {
          await tx.assignment.upsert({
            where: { categoryId_month: { categoryId, month: toDbMonth(month) } },
            create: {
              userId,
              budgetId: budget.id,
              categoryId,
              month: toDbMonth(month),
              amount: delta,
            },
            update: { amount: { increment: delta } },
          });
        }

        return {
          month,
          amount: serializeMoney(amount),
          from: sideJson(body.from),
          to: sideJson(body.to),
        };
      },
    );
  }

  private async refuseUnusableCategories(
    tx: MutationClient,
    moves: readonly CategoryMove[],
  ): Promise<void> {
    if (moves.length === 0) {
      return;
    }

    const found = await tx.category.findMany({
      where: { id: { in: moves.map((move) => move.categoryId) } },
    });

    for (const { categoryId } of moves) {
      const category = found.find((candidate) => candidate.id === categoryId);

      if (!category) {
        throw refuse(
          'UNKNOWN_CATEGORY',
          `This budget holds no category ${categoryId}, so no side of the move can name it.`,
        );
      }

      if (category.hiddenAt !== null) {
        throw refuse(
          'CATEGORY_HIDDEN',
          `Category ${categoryId} is hidden, and a hidden envelope neither takes money nor ` +
            'gives it back.',
        );
      }
    }
  }

  private async activeBudget(
    client: MutationClient | ScopedPrismaClient,
    id?: string,
  ): Promise<{ id: string }> {
    const budget = await client.budget.findFirst({
      where: { active: true, ...(id ? { id } : {}) },
    });
    if (!budget) {
      throw refuse('NO_ACTIVE_BUDGET', NO_ACTIVE_BUDGET);
    }

    return budget;
  }
}
