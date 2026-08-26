import assignmentWrites from './assignment-writes.mjs';
import mutatorPrisma from './mutator-prisma.mjs';
import prismaRaw from './prisma-raw.mjs';
import unscopedPrisma from './unscoped-prisma.mjs';

function restrict(files, patterns) {
  return {
    files,
    rules:
      patterns.length === 0
        ? { 'no-restricted-imports': 'off' }
        : { 'no-restricted-imports': ['error', { patterns }] },
  };
}

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
