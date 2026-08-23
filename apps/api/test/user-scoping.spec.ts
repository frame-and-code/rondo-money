import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@rondo/db';

import { withUserScoping } from '@/prisma/user-scoping.extension';
import { RequestContextService } from '@/request-context/request-context.service';

const noActiveBudget = (): Promise<undefined> => Promise.resolve(undefined);

describe('user-scoping extension', () => {
  const context = new RequestContextService();
  const client = new PrismaClient({
    adapter: new PrismaPg({ connectionString: 'postgresql://unused:unused@127.0.0.1:1/unused' }),
  });
  const scoped = withUserScoping(client, context, noActiveBudget);

  afterAll(async () => {
    await client.$disconnect();
  });

  const withoutIdentity = <T>(query: () => Promise<T>): Promise<T> =>
    context.run(async () => await query());

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
      await expect(
        withoutIdentity(() => scoped.userSettings.create({ data: { userId: 'user_someone' } })),
      ).rejects.toThrow(/not scoped to a user/);
    });
  });

  describe('refuses operations it has no rule for', () => {
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
