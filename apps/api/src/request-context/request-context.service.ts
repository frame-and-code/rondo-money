import { AsyncLocalStorage } from 'node:async_hooks';

import { Injectable } from '@nestjs/common';

interface RequestScope {
  userId?: string;
  budgetId?: string;
}

@Injectable()
export class RequestContextService {
  private readonly storage = new AsyncLocalStorage<RequestScope>();

  run<T>(next: () => T): T {
    return this.storage.run({}, next);
  }

  setUserId(userId: string): void {
    const scope = this.storage.getStore();
    if (!scope) {
      throw new Error(
        'No request context: RequestContextMiddleware is not mounted, so the caller ' +
          'cannot be recorded',
      );
    }

    if (scope.userId !== undefined && scope.userId !== userId) {
      throw new Error(
        'The request context already carries a different userId: the caller is recorded ' +
          'once per request, by the auth guard',
      );
    }

    scope.userId = userId;
  }

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

  setBudgetId(budgetId: string): void {
    const scope = this.storage.getStore();
    if (!scope) {
      throw new Error(
        'No request context: RequestContextMiddleware is not mounted, so the active ' +
          'budget cannot be recorded',
      );
    }

    if (scope.budgetId !== undefined && scope.budgetId !== budgetId) {
      throw new Error(
        'The request context already carries a different budgetId: the active budget is ' +
          'resolved once per request',
      );
    }

    scope.budgetId = budgetId;
  }

  readBudgetId(): string | undefined {
    return this.storage.getStore()?.budgetId;
  }
}
