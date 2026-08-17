import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '@rondo/db';

import { SCOPED_MODELS } from '@/prisma/scoped-models';

/**
 * The mechanical half of the "new table → into the registry" convention (ADR-005).
 *
 * A model that carries `userId` but is missing from `SCOPED_MODELS` is readable by anyone, and
 * nothing else in the codebase would notice: the extension simply skips it. So this walks the
 * schema itself and fails the CI gate instead of trusting anyone to remember — the Stop hook
 * `.claude/hooks/stop-scoping-drift.sh` is the earlier, softer reminder, not the guarantee.
 *
 * Unit level: reading a model's field names needs no connection, only the generated client.
 * `Prisma.dmmf` is gone in Prisma 7, hence the delegates.
 */
interface ModelDelegate {
  fields: Record<string, unknown>;
}

function isModelDelegate(value: unknown): value is ModelDelegate {
  return typeof value === 'object' && value !== null && 'fields' in value;
}

/** `UserSettings` → the client's `userSettings` property, the way Prisma names delegates. */
function delegateOf(client: PrismaClient, model: string): ModelDelegate {
  const property = model.charAt(0).toLowerCase() + model.slice(1);
  const candidate: unknown = Reflect.get(client, property);

  if (!isModelDelegate(candidate)) {
    throw new Error(
      `Cannot read the fields of model ${model}: the generated client has no delegate ` +
        `"${property}". Prisma's delegate naming changed — this test needs updating, and ` +
        'until it does the registry is unchecked.',
    );
  }

  return candidate;
}

describe('the scoped-model registry', () => {
  // Never connects: the field metadata is generated, and no query is issued below. The
  // connection string points nowhere on purpose, so a mistake here fails loudly rather than
  // touching a real database.
  const client = new PrismaClient({
    adapter: new PrismaPg({ connectionString: 'postgresql://unused:unused@127.0.0.1:1/unused' }),
  });

  afterAll(async () => {
    await client.$disconnect();
  });

  it('registers every model that carries a userId column', () => {
    const unregistered = Object.values(Prisma.ModelName).filter(
      (model) => 'userId' in delegateOf(client, model).fields && !SCOPED_MODELS.has(model),
    );

    // If this fails, the named models are unfiltered for every caller: add them to
    // apps/api/src/prisma/scoped-models.ts in this same change.
    expect(unregistered).toEqual([]);
  });

  it('registers nothing that has no userId column', () => {
    // The other direction: a model in the registry without the column would make every
    // query against it throw at runtime instead of being scoped.
    const impossible = [...SCOPED_MODELS].filter(
      (model) => !('userId' in delegateOf(client, model).fields),
    );

    expect(impossible).toEqual([]);
  });
});
