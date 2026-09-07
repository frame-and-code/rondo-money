import { Prisma } from '@rondo/db';

export const SCOPED_MODELS: ReadonlySet<Prisma.ModelName> = new Set([
  Prisma.ModelName.UserSettings,
  Prisma.ModelName.Budget,
  Prisma.ModelName.CategoryGroup,
  Prisma.ModelName.Category,
  Prisma.ModelName.Account,
  Prisma.ModelName.Transaction,
  Prisma.ModelName.Assignment,
  Prisma.ModelName.CategoryTarget,
  Prisma.ModelName.CategoryPaidMonth,
  Prisma.ModelName.IdempotencyKey,
]);

export const BUDGET_SCOPED_MODELS: ReadonlySet<Prisma.ModelName> = new Set([
  Prisma.ModelName.CategoryGroup,
  Prisma.ModelName.Category,
  Prisma.ModelName.Account,
  Prisma.ModelName.Transaction,
  Prisma.ModelName.Assignment,
  Prisma.ModelName.CategoryTarget,
  Prisma.ModelName.CategoryPaidMonth,
]);

export const MUTATION_GUARDED_MODELS: ReadonlySet<Prisma.ModelName> = new Set([
  Prisma.ModelName.Budget,
  Prisma.ModelName.CategoryGroup,
  Prisma.ModelName.Category,
  Prisma.ModelName.Account,
  Prisma.ModelName.Transaction,
  Prisma.ModelName.Assignment,
  Prisma.ModelName.CategoryTarget,
  Prisma.ModelName.CategoryPaidMonth,
]);

export const MUTATION_EXEMPT_MODELS: ReadonlySet<Prisma.ModelName> = new Set([
  Prisma.ModelName.UserSettings,
  Prisma.ModelName.IdempotencyKey,
]);
