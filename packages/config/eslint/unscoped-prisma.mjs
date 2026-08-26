const MESSAGE =
  'PrismaService is the unscoped client. It bypasses the userId auto-scoping ' +
  'extension. Domain code injects SCOPED_PRISMA (see ADR-005 and ' +
  '.claude/rules/security.md); only src/raw-sql and test fixtures may take ' +
  'the raw client.';

export default function unscopedPrisma({
  patterns = ['@/prisma/prisma.service', '**/prisma/prisma.service'],
} = {}) {
  return { group: patterns, message: MESSAGE };
}
