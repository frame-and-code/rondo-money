import { Injectable } from '@nestjs/common';
import { Prisma } from '@rondo/db';

import { PrismaService } from '@/prisma/prisma.service';
import { RequestContextService } from '@/request-context/request-context.service';

/**
 * The values a raw query may scope itself by. Supplied by this repository from the request
 * context — never taken from a caller's argument. `budgetId` joins it in F3.1.
 */
export interface RawQueryScope {
  userId: string;
}

/**
 * The only place in the codebase allowed to run raw SQL.
 *
 * The auto-scoping extension covers the Prisma model API and nothing else: `$queryRaw` and
 * `$executeRaw` bypass it completely. Since there is no row-level security behind us
 * (ADR-005), raw SQL is the one path where a forgotten filter returns another user's money —
 * which is why this class exists and why a lint rule fails CI for raw SQL written anywhere
 * else (`@rondo/config/eslint/prisma-raw`).
 *
 * The bargain it enforces: the caller writes the SQL but never supplies the identity. The
 * scope is handed to the builder, so a query outside a request cannot be issued at all —
 * `requireUserId()` throws before any SQL is sent. What it cannot enforce is that the SQL
 * actually *uses* the scope; that is what the cross-tenant tests are for, on every phase
 * that adds a raw aggregate (Phases 4–5).
 *
 * Both methods run on the top-level client, **not** on an enclosing `$transaction`. Reads are
 * unaffected, and there is no writer today: `execute` has no callers, and from F3.2 every
 * domain mutation goes through the single mutation point, in one transaction. When that
 * phase needs raw SQL inside its transaction, it passes the transactional client in — adding
 * the parameter now would be an unused API whose only test would be its own scaffolding.
 */
@Injectable()
export class ScopedRawRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: RequestContextService,
  ) {}

  /**
   * Runs a `SELECT` built from the current request's scope.
   *
   * @param build - receives the scope and returns the statement; use `Prisma.sql` so values
   *   are bound as parameters rather than interpolated into the string.
   */
  async query<T>(build: (scope: RawQueryScope) => Prisma.Sql): Promise<T[]> {
    return this.prisma.$queryRaw<T[]>(build(this.currentScope()));
  }

  /**
   * Runs a statement that writes, and returns the number of affected rows.
   *
   * Reach for it only where the model API genuinely cannot express the write — from F3.2
   * every domain mutation goes through the single mutation point, in one transaction.
   */
  async execute(build: (scope: RawQueryScope) => Prisma.Sql): Promise<number> {
    return this.prisma.$executeRaw(build(this.currentScope()));
  }

  private currentScope(): RawQueryScope {
    return { userId: this.context.requireUserId() };
  }
}
