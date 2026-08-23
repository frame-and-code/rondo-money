import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '@rondo/db';

import { BUDGET_SCOPED_MODELS, SCOPED_MODELS } from '@/prisma/scoped-models';

import { fieldsOf, modelsCarrying } from './model-fields';

describe('the scoped-model registry', () => {
  const client = new PrismaClient({
    adapter: new PrismaPg({ connectionString: 'postgresql://unused:unused@127.0.0.1:1/unused' }),
  });

  afterAll(async () => {
    await client.$disconnect();
  });

  it('registers every model that carries a userId column', () => {
    const unregistered = Object.values(Prisma.ModelName).filter(
      (model) => 'userId' in fieldsOf(client, model) && !SCOPED_MODELS.has(model),
    );

    expect(unregistered).toEqual([]);
  });

  it('registers nothing that has no userId column', () => {
    const impossible = [...SCOPED_MODELS].filter((model) => !('userId' in fieldsOf(client, model)));

    expect(impossible).toEqual([]);
  });
});

describe('the budget-scoped-model registry', () => {
  const client = new PrismaClient({
    adapter: new PrismaPg({ connectionString: 'postgresql://unused:unused@127.0.0.1:1/unused' }),
  });

  afterAll(async () => {
    await client.$disconnect();
  });

  it('registers every model that carries a budgetId column', () => {
    const unregistered = modelsCarrying(client, 'budgetId').filter(
      (model) => !BUDGET_SCOPED_MODELS.has(model),
    );

    expect(unregistered).toEqual([]);
  });

  it('registers nothing that has no budgetId column', () => {
    const impossible = [...BUDGET_SCOPED_MODELS].filter(
      (model) => !('budgetId' in fieldsOf(client, model)),
    );

    expect(impossible).toEqual([]);
  });

  it('covers the models a budget owns, and leaves the user-level ones out', () => {
    expect([...BUDGET_SCOPED_MODELS].sort()).toEqual([
      'Account',
      'Category',
      'CategoryGroup',
      'Transaction',
    ]);
    expect(BUDGET_SCOPED_MODELS.has(Prisma.ModelName.Budget)).toBe(false);
    expect(BUDGET_SCOPED_MODELS.has(Prisma.ModelName.IdempotencyKey)).toBe(false);
  });
});
