import { createHash } from 'node:crypto';

import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@rondo/db';

import {
  MUTATOR_PRISMA,
  type MutatorPrismaClient,
  type TransactionalPrismaClient,
} from '@/prisma/scoped-prisma';
import { RequestContextService } from '@/request-context/request-context.service';

export type MutationClient = TransactionalPrismaClient;

const TRANSACTION_OPTIONS = { maxWait: 5_000, timeout: 15_000 };

export interface MutationIntent<Decoded> {
  key: string;
  request: Prisma.InputJsonValue;
  decode: (stored: Prisma.JsonValue) => Decoded;
}

function carriesToJson(value: object): value is { toJSON: () => unknown } {
  return 'toJSON' in value && typeof value.toJSON === 'function';
}

function canonical(value: unknown): unknown {
  if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(canonical);
  }

  if (typeof value === 'object') {
    return carriesToJson(value)
      ? canonical(value.toJSON())
      : Object.fromEntries(
          Object.entries(value)
            .filter(([, member]) => member !== undefined)
            .sort(([left], [right]) => (left < right ? -1 : 1))
            .map(([key, member]) => [key, canonical(member)]),
        );
  }

  throw new Error(
    `A mutation request carries a ${typeof value}, which cannot identify an intent. Money is ` +
      'a string of minor units by the time it reaches here',
  );
}

function fingerprintOf(request: Prisma.InputJsonValue): string {
  return createHash('sha256')
    .update(JSON.stringify(canonical(request)))
    .digest('hex');
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

@Injectable()
export class MutationService {
  constructor(
    @Inject(MUTATOR_PRISMA) private readonly prisma: MutatorPrismaClient,
    private readonly context: RequestContextService,
  ) {}

  async run<Stored extends Prisma.JsonValue, Decoded>(
    intent: MutationIntent<Decoded>,
    work: (tx: MutationClient) => Promise<Stored>,
  ): Promise<Decoded> {
    const key = intent.key.trim();
    if (!key) {
      throw new Error(
        'An idempotency key is required: without one a repeated submit writes the operation ' +
          'a second time',
      );
    }

    if (this.context.isMutationOpen()) {
      throw new Error(
        `Refusing the mutation carrying key "${key}": this request already has a mutation open, ` +
          'and the database has no nested transaction to put a second one in. Compose the whole ' +
          'operation in one mutation instead',
      );
    }

    const userId = this.context.requireUserId();
    const requestFingerprint = fingerprintOf(intent.request);

    try {
      const stored = await this.context.runInMutation(() =>
        this.prisma.$transaction(async (tx) => {
          this.context.useBudgetSource(tx);
          const claim = await tx.idempotencyKey.create({
            data: { userId, key, requestFingerprint },
          });
          const result = await work(tx);
          await tx.idempotencyKey.update({
            where: { id: claim.id },
            data: { result: result === null ? Prisma.JsonNull : result },
          });

          return result;
        }, TRANSACTION_OPTIONS),
      );

      return intent.decode(stored);
    } catch (error) {
      if (!isUniqueViolation(error)) {
        throw error;
      }

      return intent.decode(
        await this.resultOfTheFirstAttempt(userId, key, requestFingerprint, error),
      );
    }
  }

  private async resultOfTheFirstAttempt(
    userId: string,
    key: string,
    requestFingerprint: string,
    conflict: unknown,
  ): Promise<Prisma.JsonValue> {
    const claimed = await this.prisma.idempotencyKey.findUnique({
      where: { userId_key: { userId, key } },
    });
    if (!claimed) {
      throw conflict;
    }

    if (claimed.requestFingerprint !== requestFingerprint) {
      throw new ConflictException(
        `Refusing the mutation carrying key "${key}": the idempotency key was claimed by a ` +
          "different request, and answering with the first one's result would report a write " +
          'it never made',
      );
    }

    return claimed.result ?? null;
  }
}
