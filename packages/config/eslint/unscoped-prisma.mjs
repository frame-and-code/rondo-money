export default function unscopedPrisma({
  allow = [],
  patterns = ['@/prisma/prisma.service', '**/prisma/prisma.service'],
} = {}) {
  return [
    {
      files: ['**/*.ts'],
      ignores: allow,
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: patterns,
                message:
                  'PrismaService is the unscoped client — it bypasses the userId auto-scoping ' +
                  'extension. Domain code injects SCOPED_PRISMA (see ADR-005 and ' +
                  '.claude/rules/security.md); only src/raw-sql and test fixtures may take ' +
                  'the raw client.',
              },
            ],
          },
        ],
      },
    },
  ];
}
