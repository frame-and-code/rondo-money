import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@rondo/db';

import { MutationService } from '@/mutations/mutation.service';
import { withUserScoping } from '@/prisma/user-scoping.extension';
import { RequestContextService } from '@/request-context/request-context.service';

const USER = 'user_a';

const noActiveBudget = (): Promise<undefined> => Promise.resolve(undefined);

describe('the key a mutation is claimed with', () => {
  const context = new RequestContextService();
  const client = new PrismaClient({
    adapter: new PrismaPg({ connectionString: 'postgresql://unused:unused@127.0.0.1:1/unused' }),
  });
  const scoped = withUserScoping(client, context, noActiveBudget);
  const mutations = new MutationService(scoped, context);

  afterAll(async () => {
    await client.$disconnect();
  });

  const write = (key: string): Promise<{ ok: boolean }> =>
    context.run(async () => {
      context.setUserId(USER);
      return await mutations.run(
        { key, request: { amount: '500' }, decode: () => ({ ok: true }) },
        () => Promise.resolve({ ok: true }),
      );
    });

  it.each(['', '   '])('refuses a blank key (%p) before opening a transaction', async (key) => {
    // The mechanism rather than the driver's wording: a connection error would satisfy any
    // assertion about the message, and would mean the transaction had been opened after all.
    const opened = jest.spyOn(scoped, '$transaction');

    try {
      const failure: unknown = await write(key).catch((error: unknown) => error);
      const message = failure instanceof Error ? failure.message : String(failure);

      expect(failure).toBeInstanceOf(Error);
      expect(message).toMatch(/idempotency key/i);
      expect(opened).not.toHaveBeenCalled();
    } finally {
      opened.mockRestore();
    }
  });
});
