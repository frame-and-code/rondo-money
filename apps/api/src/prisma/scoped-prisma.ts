import { type withUserScoping } from '@/prisma/user-scoping.extension';

/// What domain code injects. Refuses any operation on a scoped model while a mutation is open,
/// because it would run beside that mutation's transaction rather than in it.
export const SCOPED_PRISMA = 'SCOPED_PRISMA';

/// What the mutation service opens its transaction from. The same scoping, without that
/// refusal, so the transactional client it hands to a mutation's work accepts what the
/// boundary above refuses. A symbol rather than a string, so the only way to ask for it is the
/// import the lint rule watches.
export const MUTATOR_PRISMA = Symbol('MUTATOR_PRISMA');

export type MutatorPrismaClient = ReturnType<typeof withUserScoping>;

export type ScopedPrismaClient = MutatorPrismaClient;

/// The client a mutation's work runs on: the scoped client inside an interactive transaction.
/// Prisma strips `$transaction` from it, which is what makes a nested transaction unreachable.
export type TransactionalPrismaClient = Parameters<
  Parameters<MutatorPrismaClient['$transaction']>[0]
>[0];
