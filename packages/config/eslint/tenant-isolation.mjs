import assignmentWrites from './assignment-writes.mjs';
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

/// The same rule for `no-restricted-syntax`, and for the same reason.
function restrictSyntax(files, selectors) {
  return {
    files,
    rules:
      selectors.length === 0
        ? { 'no-restricted-syntax': 'off' }
        : { 'no-restricted-syntax': ['error', ...selectors] },
  };
}

export default function tenantIsolation({ prefix = '' } = {}) {
  const unscoped = unscopedPrisma();
  const mutator = mutatorPrisma();

  const raw = prismaRaw();
  const assignments = assignmentWrites();

  const rawSql = `${prefix}src/raw-sql/**/*.ts`;
  const mutations = `${prefix}src/mutations/**/*.ts`;
  const prisma = `${prefix}src/prisma/**/*.ts`;
  const moves = `${prefix}src/moves/**/*.ts`;
  const tests = `${prefix}test/**/*.ts`;

  return [
    restrictSyntax(['**/*.ts'], [raw, assignments]),
    restrictSyntax([rawSql], [assignments]),
    restrictSyntax([moves, tests], [raw]),
    restrict(['**/*.ts'], [unscoped, mutator]),
    restrict([rawSql], [mutator]),
    restrict([mutations], [unscoped]),
    restrict([prisma, tests], []),
  ];
}
