// @rondo/config/eslint/unscoped-prisma — the unscoped Prisma client stays out of domain code.
//
// `PrismaService` is the raw client the auto-scoping extension is built on: a query issued
// through it carries no `userId` filter at all. It has to stay injectable for the two callers
// that scope by hand (the raw-SQL repository) or deliberately work across users (test
// fixtures) — and it is exported from a `@Global()` module under the most obvious name in the
// codebase, so `constructor(private readonly prisma: PrismaService)` in a domain service would
// pass typecheck and every test while quietly bypassing ADR-005.
//
// This is the third of the three ways round that decision. The other two are already
// mechanical: the model registry is checked by a unit test, raw SQL by
// `@rondo/config/eslint/prisma-raw`. This closes the last one at the import.

/**
 * @param {object} [options]
 * @param {string[]} [options.allow] - flat-config `files` patterns, relative to the consuming
 *   config, that may import the unscoped client: the module that provides it, the directory
 *   that scopes raw SQL itself, and the tests that set up rows across users.
 * @param {string[]} [options.patterns] - import paths to forbid. Defaults to the api's alias
 *   and any relative spelling of the same module.
 * @returns {import('eslint').Linter.Config[]}
 */
export default function unscopedPrisma({
  allow = [],
  patterns = ['@/prisma/prisma.service', '**/prisma/prisma.service'],
} = {}) {
  return [
    {
      files: ['**/*.ts'],
      // Expressed as `ignores`, not as a later layer switching the rule off: flat config
      // cannot subtract one entry from `no-restricted-imports`, so `off` would also drop
      // anything else the base — or a future layer — restricts in those paths.
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
