import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '@rondo/db';

import { SCOPED_MODELS } from '@/prisma/scoped-models';

interface ModelDelegate {
  fields: Record<string, unknown>;
}

function isModelDelegate(value: unknown): value is ModelDelegate {
  return typeof value === 'object' && value !== null && 'fields' in value;
}

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

    expect(unregistered).toEqual([]);
  });

  it('registers nothing that has no userId column', () => {
    const impossible = [...SCOPED_MODELS].filter(
      (model) => !('userId' in delegateOf(client, model).fields),
    );

    expect(impossible).toEqual([]);
  });
});
