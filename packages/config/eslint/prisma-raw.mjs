// @rondo/config/eslint/prisma-raw — raw Prisma SQL stays where it can be reviewed.
//
// This is not a style rule. The auto-scoping Client Extension covers the model API only:
// `$queryRaw` / `$executeRaw` go straight to Postgres with whatever filter the author
// remembered to write. With no row-level security behind them (ADR-005), that makes raw SQL
// the one place a forgotten `where user_id` silently returns another user's money — so the
// decision was to confine it to a single directory and let CI enforce the boundary.

/** Matches `$queryRaw`, `$queryRawUnsafe`, `$executeRaw`, `$executeRawUnsafe` — the four the
 * generated Prisma 7 client exposes — whether tagged (`prisma.$queryRaw\`…\``) or called. */
const RAW_SQL_MEMBER = 'MemberExpression[property.name=/^\\$(query|execute)Raw(Unsafe)?$/]';

const MESSAGE =
  'Raw Prisma SQL bypasses the userId auto-scoping extension. Put the query behind ' +
  'ScopedRawRepository (apps/api/src/raw-sql), which supplies the scope from the request ' +
  'context — see ADR-005 and .claude/rules/security.md.';

/**
 * @param {object} [options]
 * @param {string[]} [options.allow] - flat-config `files` patterns, relative to the consuming
 *   config, whose contents may call the raw methods. Keep this to the directory that owns
 *   scoping; one exception per controller is how the rule stops being read.
 * @returns {import('eslint').Linter.Config[]}
 */
export default function prismaRaw({ allow = [] } = {}) {
  const configs = [
    {
      files: ['**/*.ts'],
      rules: {
        'no-restricted-syntax': ['error', { selector: RAW_SQL_MEMBER, message: MESSAGE }],
      },
    },
  ];

  if (allow.length > 0) {
    // Switches the whole rule off rather than subtracting this one selector — flat config has
    // no way to remove a single entry, and `no-restricted-syntax` is used for nothing else.
    configs.push({ files: allow, rules: { 'no-restricted-syntax': 'off' } });
  }

  return configs;
}
