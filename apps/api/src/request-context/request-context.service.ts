import { AsyncLocalStorage } from 'node:async_hooks';

import { Injectable } from '@nestjs/common';

import { type BudgetSource } from '@/prisma/active-budget.resolver';

interface ActiveBudget {
  id?: string;
  lookup?: Promise<string | undefined>;
  /// The client the active budget is read on. A mutation puts its transaction here, so the
  /// lookup sees the rows that transaction has written and takes no second connection.
  source?: BudgetSource;
}

interface OpenMutation {
  open?: boolean;
}

interface RequestScope {
  userId?: string;
  /// Held behind a reference the nested store of a mutation shares, so a budget resolved
  /// inside one is still resolved after it returns.
  budget: ActiveBudget;
  /// Shared the same way, so a second mutation started beside the first is seen. `inMutation`
  /// below is per-store on purpose: it has to go false when its own work settles, which is
  /// what refuses a promise that escaped the mutation that started it.
  mutation: OpenMutation;
  inMutation?: boolean;
}

@Injectable()
export class RequestContextService {
  private readonly storage = new AsyncLocalStorage<RequestScope>();

  run<T>(next: () => T): T {
    return this.storage.run({ budget: {}, mutation: {} }, next);
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

    if (scope.budget.id !== undefined && scope.budget.id !== budgetId) {
      throw new Error(
        'The request context already carries a different budgetId: the active budget is ' +
          'resolved once per request',
      );
    }

    scope.budget.id = budgetId;
  }

  readBudgetId(): string | undefined {
    return this.storage.getStore()?.budget.id;
  }

  budgetOnce(lookup: (userId: string) => Promise<string | undefined>): Promise<string | undefined> {
    const scope = this.storage.getStore();
    if (!scope) {
      throw new Error(
        'No request context: RequestContextMiddleware is not mounted, so the active ' +
          'budget cannot be looked up',
      );
    }

    if (scope.budget.id !== undefined) {
      return Promise.resolve(scope.budget.id);
    }

    if (scope.budget.lookup) {
      return scope.budget.lookup;
    }

    // The answer is remembered; neither an absence nor a failure is. A budget created later in
    // the same request has to be found by the next query that needs one, and a lookup that is
    // no longer the one on the scope was dropped while in flight, by a mutation that rolled
    // back, so its answer describes a row that may be gone.
    const inFlight: Promise<string | undefined> = lookup(this.requireUserId()).then(
      (budgetId) => {
        if (scope.budget.lookup !== inFlight) {
          return undefined;
        }

        if (budgetId === undefined) {
          scope.budget.lookup = undefined;
        } else {
          scope.budget.id = budgetId;
        }

        return budgetId;
      },
      (failure: unknown) => {
        if (scope.budget.lookup === inFlight) {
          scope.budget.lookup = undefined;
        }

        throw failure;
      },
    );
    scope.budget.lookup = inFlight;

    return inFlight;
  }

  runInMutation<T>(work: () => Promise<T>): Promise<T> {
    const scope = this.storage.getStore();
    if (!scope) {
      throw new Error(
        'No request context: a mutation runs inside a request, so the marker has nowhere to go',
      );
    }

    // Two things this shape buys. The await belongs inside the scope, because a Prisma promise
    // runs its hooks when it is awaited, so an un-awaited one would leave the marker behind.
    // And the store is cleared when the work settles, so a promise that escapes the mutation
    // is refused rather than writing outside the transaction it was started in.
    const store: RequestScope = { ...scope, inMutation: true };
    // Only the outermost marker owns the shared flag. A nested one that cleared it on its way
    // out would let a second transaction open beside the first, which is what it refuses.
    const opensTheMutation = !store.mutation.open;
    store.mutation.open = true;

    return this.storage.run(store, async () => {
      try {
        return await work();
      } catch (failure) {
        // The budget was read on a transaction that is now rolled back, so the row it names
        // may be gone. Remembering it would filter the rest of the request by a row nobody has.
        store.budget.id = undefined;
        store.budget.lookup = undefined;
        throw failure;
      } finally {
        store.inMutation = false;
        if (opensTheMutation) {
          store.mutation.open = false;
          store.budget.source = undefined;
        }
      }
    });
  }

  isMutationOpen(): boolean {
    return this.storage.getStore()?.mutation.open === true;
  }

  useBudgetSource(source: BudgetSource): void {
    const scope = this.storage.getStore();
    if (!scope) {
      throw new Error(
        'No request context: a mutation runs inside a request, so its transaction has ' +
          'nowhere to be recorded',
      );
    }

    scope.budget.source = source;
  }

  readBudgetSource(): BudgetSource | undefined {
    return this.storage.getStore()?.budget.source;
  }

  isInMutation(): boolean {
    return this.storage.getStore()?.inMutation === true;
  }
}
