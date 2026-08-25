import { PrismaPg } from '@prisma/adapter-pg';
import { $Enums, Prisma, PrismaClient } from '@rondo/db';
import { ACCOUNT_TYPES } from '@rondo/types';

import { fieldsOf, modelsCarrying } from './model-fields';

const DOMAIN_MODELS = [
  'Budget',
  'CategoryGroup',
  'Category',
  'Account',
  'Transaction',
  'Assignment',
  'IdempotencyKey',
] as const;

const BUDGET_OWNED_MODELS = [
  'CategoryGroup',
  'Category',
  'Account',
  'Transaction',
  'Assignment',
] as const;

describe('the domain core schema', () => {
  const client = new PrismaClient({
    adapter: new PrismaPg({ connectionString: 'postgresql://unused:unused@127.0.0.1:1/unused' }),
  });

  afterAll(async () => {
    await client.$disconnect();
  });

  it('carries every model of the domain core', () => {
    const missing = DOMAIN_MODELS.filter(
      (model) => !Object.values<string>(Prisma.ModelName).includes(model),
    );

    expect(missing).toEqual([]);
  });

  it.each(DOMAIN_MODELS)('scopes %s to a user', (model) => {
    expect(Object.keys(fieldsOf(client, model))).toContain('userId');
  });

  it.each(BUDGET_OWNED_MODELS)('scopes %s to a budget as well', (model) => {
    expect(Object.keys(fieldsOf(client, model))).toContain('budgetId');
  });

  it('publishes exactly the account kinds the column holds', () => {
    // The two lists are written in different packages, and the published one cannot import the
    // schema. Without this, a kind added to the column is refused by the API that stores it and
    // throws on the way back out.
    expect([...ACCOUNT_TYPES].sort()).toEqual(Object.values($Enums.AccountType).sort());
  });

  it('keeps the user-level models out of a budget', () => {
    expect(Object.keys(fieldsOf(client, 'Budget'))).not.toContain('budgetId');
    expect(Object.keys(fieldsOf(client, 'IdempotencyKey'))).not.toContain('budgetId');
  });

  it('gives a category a look of its own, and gives a group none', () => {
    const category = Object.keys(fieldsOf(client, 'Category'));

    expect(category).toContain('icon');
    expect(category).toContain('color');
    expect(Object.keys(fieldsOf(client, 'CategoryGroup'))).not.toContain('icon');
    expect(Object.keys(fieldsOf(client, 'CategoryGroup'))).not.toContain('color');
  });

  it('soft-deletes nothing: no model carries deletedAt', () => {
    expect(modelsCarrying(client, 'deletedAt')).toEqual([]);
  });

  it('marks disappearance with the field that fits the model', () => {
    expect(Object.keys(fieldsOf(client, 'CategoryGroup'))).toContain('hiddenAt');
    expect(Object.keys(fieldsOf(client, 'Category'))).toContain('hiddenAt');
    expect(Object.keys(fieldsOf(client, 'Account'))).toContain('archivedAt');
    expect(Object.keys(fieldsOf(client, 'Budget'))).toContain('active');
  });
});
