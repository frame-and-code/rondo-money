import { type PrismaClient } from '@rondo/db';

import { SCOPED_MODELS } from '@/prisma/scoped-models';

interface CountingDelegate {
  count(args: { where: { userId: string } }): Promise<number>;
}

function isCountingDelegate(value: unknown): value is CountingDelegate {
  return typeof value === 'object' && value !== null && 'count' in value;
}

async function ownedRows(client: PrismaClient, userId: string): Promise<Record<string, number>> {
  const counted = await Promise.all(
    [...SCOPED_MODELS].map(async (model) => {
      const property = model.charAt(0).toLowerCase() + model.slice(1);
      const delegate: unknown = Reflect.get(client, property);

      if (!isCountingDelegate(delegate)) {
        throw new Error(
          `Cannot count ${model}: the generated client has no delegate "${property}". Either ` +
            'the migration that creates it is missing, or the delegate naming changed.',
        );
      }

      return [model, await delegate.count({ where: { userId } })] as const;
    }),
  );

  return Object.fromEntries(counted);
}

export async function heldBy(client: PrismaClient, userId: string): Promise<[string, number][]> {
  const counted = await ownedRows(client, userId);

  return Object.entries(counted).filter(([, rows]) => rows > 0);
}
