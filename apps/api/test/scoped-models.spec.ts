import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '@rondo/db';

import {
  BUDGET_SCOPED_MODELS,
  MUTATION_EXEMPT_MODELS,
  MUTATION_GUARDED_MODELS,
  SCOPED_MODELS,
} from '@/prisma/scoped-models';

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
      'Assignment',
      'Category',
      'CategoryGroup',
      'CategoryPaidMonth',
      'CategoryTarget',
      'Transaction',
    ]);
    expect(BUDGET_SCOPED_MODELS.has(Prisma.ModelName.Budget)).toBe(false);
    expect(BUDGET_SCOPED_MODELS.has(Prisma.ModelName.IdempotencyKey)).toBe(false);
  });
});

describe('the mutation-guarded-model registry', () => {
  it('classifies every model in the schema, so a new one has to be decided about', () => {
    const unclassified = Object.values(Prisma.ModelName).filter(
      (model) => !MUTATION_GUARDED_MODELS.has(model) && !MUTATION_EXEMPT_MODELS.has(model),
    );

    expect(unclassified).toEqual([]);
  });

  it('guards nothing the scoping extension does not reach', () => {
    const unreachable = [...MUTATION_GUARDED_MODELS].filter((model) => !SCOPED_MODELS.has(model));

    expect(unreachable).toEqual([]);
  });

  it('never calls a model both guarded and exempt', () => {
    const both = [...MUTATION_GUARDED_MODELS].filter((model) => MUTATION_EXEMPT_MODELS.has(model));

    expect(both).toEqual([]);
  });

  it('guards the domain models and exempts the two no mutation owns', () => {
    expect([...MUTATION_GUARDED_MODELS].sort()).toEqual([
      'Account',
      'Assignment',
      'Budget',
      'Category',
      'CategoryGroup',
      'CategoryPaidMonth',
      'CategoryTarget',
      'Transaction',
    ]);
    expect([...MUTATION_EXEMPT_MODELS].sort()).toEqual(['IdempotencyKey', 'UserSettings']);
  });
});
