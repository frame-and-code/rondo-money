// @rondo/config/eslint/tenant-isolation — the two lint rules that stand in for RLS (ADR-005),
// with their allow-lists written once.
//
// They have to be installed at **both** ESLint entry points: per-workspace runs (`turbo lint`,
// the CI gate) load `apps/api/eslint.config.mjs`, while the pre-commit hook runs `eslint` from
// the repository root through lint-staged and loads the root config. Installed in only one of
// them, a staged violation passes the commit and surfaces a push later, in CI.
//
// Hence the prefix: the paths differ between the two entry points, but the list of what may
// legitimately reach the unscoped client does not — and that list drifting apart is how one of
// the two guards quietly stops matching.

import prismaRaw from './prisma-raw.mjs';
import unscopedPrisma from './unscoped-prisma.mjs';

/**
 * @param {object} [options]
 * @param {string} [options.prefix] - path from the consuming config to the api workspace,
 *   with a trailing slash. Empty (the default) when the config sits inside `apps/api`;
 *   `'apps/api/'` from the repository root.
 * @returns {import('eslint').Linter.Config[]}
 */
export default function tenantIsolation({ prefix = '' } = {}) {
  return [
    // Raw SQL bypasses the auto-scoping extension entirely, so it lives in the single
    // directory that scopes it by hand.
    ...prismaRaw({ allow: [`${prefix}src/raw-sql/**/*.ts`] }),
    // The unscoped client stays with the module that provides it, that same raw-SQL directory,
    // and the fixtures that deliberately set up rows across users.
    ...unscopedPrisma({
      allow: [
        `${prefix}src/prisma/**/*.ts`,
        `${prefix}src/raw-sql/**/*.ts`,
        `${prefix}test/**/*.ts`,
      ],
    }),
  ];
}
