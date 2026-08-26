import { type withUserScoping } from '@/prisma/user-scoping.extension';

export const SCOPED_PRISMA = 'SCOPED_PRISMA';

export const MUTATOR_PRISMA = Symbol('MUTATOR_PRISMA');

export type MutatorPrismaClient = ReturnType<typeof withUserScoping>;

export type ScopedPrismaClient = MutatorPrismaClient;

export type TransactionalPrismaClient = Parameters<
  Parameters<MutatorPrismaClient['$transaction']>[0]
>[0];
