import { AsyncLocalStorage } from 'node:async_hooks';

import { Injectable } from '@nestjs/common';

/**
 * What a single request carries. Mutable on purpose: the scope is opened by the middleware
 * before anything is known and filled by the guard once the token is verified.
 *
 * An object rather than a bare string because later phases add fields to the same store —
 * the active `budgetId` (F3.1) and the marker saying a write is happening inside the
 * mutation service (F3.2). Those fields arrive with the tickets that need them.
 */
interface RequestScope {
  userId?: string;
}

/**
 * The caller's identity for the duration of one request, readable from anywhere in its
 * async call chain without being passed as an argument.
 *
 * This is the second link of the isolation chain from ADR-005: the guard verifies the token
 * and puts `userId` here, the Prisma extension and the raw-SQL repository read it back when
 * they build queries. Handing `userId` down through every service signature would work too,
 * right until the one call site that forgets — and a forgotten filter returns someone
 * else's money with no error anywhere.
 */
@Injectable()
export class RequestContextService {
  /**
   * One storage per process, one scope per request. `AsyncLocalStorage` keeps concurrent
   * requests apart across every `await` in the chain; a field on this provider could not —
   * Nest providers are singletons, so two requests in flight would overwrite each other's
   * `userId` and one caller would read the other's data.
   */
  private readonly storage = new AsyncLocalStorage<RequestScope>();

  /** Opens the scope for one request: everything `next` reaches, however deep, sees it. */
  run<T>(next: () => T): T {
    return this.storage.run({}, next);
  }

  /** Records the caller, from the verified token's `sub` and from nowhere else. */
  setUserId(userId: string): void {
    const scope = this.storage.getStore();
    if (!scope) {
      // Only reachable when the middleware is not mounted. Loud here, because the quiet
      // version of this bug is every later query running without a scope.
      throw new Error(
        'No request context: RequestContextMiddleware is not mounted, so the caller ' +
          'cannot be recorded',
      );
    }

    if (scope.userId !== undefined && scope.userId !== userId) {
      // The store is the only source of tenant identity for the scoped client and for
      // `ScopedRawRepository`. A second writer with a different id would silently move the
      // rest of the request to another user's data, so refuse instead of overwriting.
      throw new Error(
        'The request context already carries a different userId: the caller is recorded ' +
          'once per request, by the auth guard',
      );
    }

    scope.userId = userId;
  }

  /**
   * The caller's id, or an exception — never `undefined`. The exception is the feature:
   * with no row-level security behind us (ADR-005), a query that cannot name its user has
   * to fail rather than fall back to reading everything.
   */
  requireUserId(): string {
    const userId = this.storage.getStore()?.userId;
    if (!userId) {
      throw new Error(
        'No userId in the request context: this query is not scoped to a user. Reached ' +
          'either outside a request or on a route that carries no identity.',
      );
    }

    return userId;
  }
}
