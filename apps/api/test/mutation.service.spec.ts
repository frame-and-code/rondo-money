import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@rondo/db';

import { MutationService } from '@/mutations/mutation.service';
import { withUserScoping } from '@/prisma/user-scoping.extension';
import { RequestContextService } from '@/request-context/request-context.service';

const USER = 'user_a';
const REACHES_THE_DRIVER = /reach database server|ECONNREFUSED/i;

const noActiveBudget = (): Promise<undefined> => Promise.resolve(undefined);

describe('the key a mutation is claimed with', () => {
  const context = new RequestContextService();
  const client = new PrismaClient({
    adapter: new PrismaPg({ connectionString: 'postgresql://unused:unused@127.0.0.1:1/unused' }),
  });
  const mutations = new MutationService(withUserScoping(client, context, noActiveBudget), context);

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
    const failure: unknown = await write(key).catch((error: unknown) => error);
    const message = failure instanceof Error ? failure.message : String(failure);

    expect(failure).toBeInstanceOf(Error);
    expect(message).toMatch(/idempotency key/i);
    expect(message).not.toMatch(REACHES_THE_DRIVER);
  });
});
