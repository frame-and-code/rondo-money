import mutatorPrisma from './mutator-prisma.mjs';
import prismaRaw from './prisma-raw.mjs';
import unscopedPrisma from './unscoped-prisma.mjs';

/// Every restriction on `no-restricted-imports` that applies to a file has to arrive in one
/// object. Flat config replaces a rule's options rather than merging them, so two blocks each
/// setting this rule leave only the last one standing, and the guard the earlier one carried
/// disappears with no error anywhere. Each block below therefore lists every restriction its
/// files are subject to, and the later blocks name the exemptions.
function restrict(files, patterns) {
  return {
    files,
    rules:
      patterns.length === 0
        ? { 'no-restricted-imports': 'off' }
        : { 'no-restricted-imports': ['error', { patterns }] },
  };
}

export default function tenantIsolation({ prefix = '' } = {}) {
  const unscoped = unscopedPrisma();
  const mutator = mutatorPrisma();

  const rawSql = `${prefix}src/raw-sql/**/*.ts`;
  const mutations = `${prefix}src/mutations/**/*.ts`;
  const prisma = `${prefix}src/prisma/**/*.ts`;
  const tests = `${prefix}test/**/*.ts`;

  return [
    ...prismaRaw({ allow: [rawSql] }),
    restrict(['**/*.ts'], [unscoped, mutator]),
    restrict([rawSql], [mutator]),
    restrict([mutations], [unscoped]),
    restrict([prisma, tests], []),
  ];
}
