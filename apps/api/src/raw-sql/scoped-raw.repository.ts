import { Injectable } from '@nestjs/common';
import { Prisma } from '@rondo/db';

import { PrismaService } from '@/prisma/prisma.service';
import { RequestContextService } from '@/request-context/request-context.service';

export interface RawQueryScope {
  userId: string;
}

export interface RawExecutor {
  $executeRaw(query: Prisma.Sql): Promise<number>;
}

export interface RawReader {
  $queryRaw<T>(query: Prisma.Sql): Promise<T>;
}

@Injectable()
export class ScopedRawRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: RequestContextService,
  ) {}

  async query<T>(build: (scope: RawQueryScope) => Prisma.Sql, on?: RawReader): Promise<T[]> {
    if (this.context.isInMutation()) {
      this.requireTheMutationsClient(on, 'read');
    }

    const statement = build(this.currentScope());

    return on ? on.$queryRaw<T[]>(statement) : this.prisma.$queryRaw<T[]>(statement);
  }

  async execute(build: (scope: RawQueryScope) => Prisma.Sql, on: RawExecutor): Promise<number> {
    if (!this.context.isInMutation()) {
      throw new Error(
        'Refusing a raw write outside a mutation: a statement that changes rows belongs to the ' +
          'single mutation service, and has to run on that transaction to roll back with it.',
      );
    }

    this.requireTheMutationsClient(on, 'write');

    return on.$executeRaw(build(this.currentScope()));
  }

  /// Being inside a mutation is not enough: the statement has to run on that mutation's own
  /// client. Any other one is the pooled connection, where a write commits on its own and a
  /// read answers from before the transaction started. The type cannot say this, because every
  /// client satisfies the one-method interface these take.
  private requireTheMutationsClient(on: unknown, kind: 'read' | 'write'): void {
    if (on !== undefined && on === this.context.readBudgetSource()) {
      return;
    }

    throw new Error(
      `Refusing a raw ${kind} inside a mutation on a client that is not the mutation's: it ` +
        'would run on the pooled connection, beside the transaction rather than in it. Pass ' +
        'the client the mutation handed you.',
    );
  }

  private currentScope(): RawQueryScope {
    return { userId: this.context.requireUserId() };
  }
}
