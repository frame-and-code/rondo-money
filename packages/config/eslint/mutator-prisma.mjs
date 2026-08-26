const MESSAGE =
  'MUTATOR_PRISMA is the layer below the mutation boundary: it accepts a guarded write while ' +
  "a mutation is open, which is how a write lands outside that mutation's transaction. Domain " +
  'code injects SCOPED_PRISMA and writes through the client MutationService hands it. See ' +
  '.claude/rules/security.md.';

export default function mutatorPrisma({
  patterns = ['@/prisma/scoped-prisma', '**/prisma/scoped-prisma'],
} = {}) {
  return {
    group: patterns,
    importNames: ['MUTATOR_PRISMA', 'MutatorPrismaClient'],
    message: MESSAGE,
  };
}
