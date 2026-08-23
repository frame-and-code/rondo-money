const MESSAGE =
  'MUTATOR_PRISMA is the layer below the mutation boundary: it accepts a guarded write while ' +
  "a mutation is open, which is how a write lands outside that mutation's transaction. Domain " +
  'code injects SCOPED_PRISMA and writes through the client MutationService hands it. See ' +
  '.claude/rules/security.md.';

/// A `patterns` entry rather than `paths`: only patterns are globs, so this covers the aliased
/// spelling and the relative one. See unscoped-prisma.mjs for why it is not a config block.
export default function mutatorPrisma({
  patterns = ['@/prisma/scoped-prisma', '**/prisma/scoped-prisma'],
} = {}) {
  return {
    group: patterns,
    importNames: ['MUTATOR_PRISMA', 'MutatorPrismaClient'],
    message: MESSAGE,
  };
}
