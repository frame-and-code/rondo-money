import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@rondo/db';

import { withUserScoping } from '@/prisma/user-scoping.extension';
import { RequestContextService } from '@/request-context/request-context.service';

/**
 * Unit level: the extension's refusals, which are the half that must never reach the database.
 *
 * Every case here throws *before* a query is sent, which is why an unreachable connection
 * string is enough — and is itself the assertion: had the extension let the operation through,
 * these tests would fail on a connection error instead of the expected message. What the
 * arguments end up looking like is proven where it can actually be observed, against the real
 * database, in `user-scoping.integration.spec.ts`.
 */
describe('user-scoping extension', () => {
  const context = new RequestContextService();
  const client = new PrismaClient({
    adapter: new PrismaPg({ connectionString: 'postgresql://unused:unused@127.0.0.1:1/unused' }),
  });
  const scoped = withUserScoping(client, context);

  afterAll(async () => {
    await client.$disconnect();
  });

  /** A request that reached the API without an identity — a `@Public()` route, or none at all. */
  const withoutIdentity = <T>(query: () => Promise<T>): Promise<T> =>
    context.run(async () => await query());

  /**
   * A request from a signed-in caller.
   *
   * The `await` has to happen **inside** the scope. Prisma's promises are lazy: the extension
   * runs when the promise is awaited, not when `findMany()` is called, so handing the
   * un-awaited promise out of `run()` executes the hooks with no context at all. In the
   * running app this cannot happen — the middleware wraps the whole request, awaits included —
   * but a test that gets it wrong quietly passes for the wrong reason.
   */
  const asUser = <T>(userId: string, query: () => Promise<T>): Promise<T> =>
    context.run(async () => {
      context.setUserId(userId);
      return await query();
    });

  describe('refuses to read or write without a caller', () => {
    it('rejects a read issued outside any request', async () => {
      await expect(scoped.userSettings.findMany()).rejects.toThrow(/not scoped to a user/);
    });

    it('rejects a read inside a request that carries no identity', async () => {
      await expect(withoutIdentity(() => scoped.userSettings.findMany())).rejects.toThrow(
        /not scoped to a user/,
      );
    });

    it('rejects a write inside a request that carries no identity', async () => {
      // The payload names an owner, and it still does not help: the value is overwritten with
      // the caller's, and with no caller there is nothing to overwrite it with. (Prisma's types
      // require `userId` on a create, which is why it appears here at all.)
      await expect(
        withoutIdentity(() => scoped.userSettings.create({ data: { userId: 'user_someone' } })),
      ).rejects.toThrow(/not scoped to a user/);
    });
  });

  describe('refuses operations it has no rule for', () => {
    // The point of the catch-all: `groupBy` and `aggregate` would otherwise run across every
    // user's rows, and nothing would say so. They stay refused until someone scopes them
    // deliberately (Phase 4, where the aggregates live).
    it('rejects groupBy, naming the operation', async () => {
      await expect(
        asUser('user_a', () => scoped.userSettings.groupBy({ by: ['userId'] })),
      ).rejects.toThrow(/Refusing "groupBy" on UserSettings/);
    });

    it('rejects aggregate', async () => {
      await expect(
        asUser('user_a', () => scoped.userSettings.aggregate({ _count: true })),
      ).rejects.toThrow(/has no scoping rule/);
    });
  });
});
