const MESSAGE =
  'PrismaService is the unscoped client — it bypasses the userId auto-scoping ' +
  'extension. Domain code injects SCOPED_PRISMA (see ADR-005 and ' +
  '.claude/rules/security.md); only src/raw-sql and test fixtures may take ' +
  'the raw client.';

/// One entry of a `no-restricted-imports` `patterns` list rather than a whole config block:
/// every restriction on that rule has to reach a file in a single object, because flat config
/// replaces a rule's options instead of merging them. tenant-isolation.mjs composes them.
export default function unscopedPrisma({
  patterns = ['@/prisma/prisma.service', '**/prisma/prisma.service'],
} = {}) {
  return { group: patterns, message: MESSAGE };
}
