// @rondo/config/eslint — shared flat config (F0.2).
// Inherited verbatim by every workspace via a 2-line `eslint.config.mjs`.
// Order matters: js → typescript-eslint → import rules → prettier (must be last,
// so it can switch off everything that would fight the formatter).
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import importX from 'eslint-plugin-import-x';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    // Never lint generated / vendored output anywhere in the repo.
    ignores: [
      '**/dist/**',
      '**/build/**',
      '**/.next/**',
      '**/coverage/**',
      '**/generated/**',
      '**/node_modules/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  {
    // Unified import rules across the repo.
    plugins: { 'import-x': importX },
    rules: {
      // TypeScript resolves modules; the plugin's own resolver only adds noise here.
      'import-x/no-unresolved': 'off',
      'import-x/no-duplicates': 'error',
      'import-x/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index', 'type'],
          pathGroups: [
            // `@/...` is the intra-package alias for `src/*` (see tsconfig paths).
            { pattern: '@/**', group: 'internal' },
            // Workspace packages are pinned to `external` rather than left to the resolver.
            // Without this the group a `@rondo/*` import lands in depends on whether the
            // package happens to be **built**: a package that self-imports (its own tests
            // import it by its public name, as consumers do) resolves through `exports` to
            // `dist`, so the same file lints clean locally after a build and fails in CI,
            // where `lint` has no reason to build anything first. A lint result that depends
            // on build state is a coin flip, and it cost a red gate before it was pinned.
            //
            // One star, not two: a subpath import like `@rondo/ui/lib/utils` resolves off the
            // package directory and never depended on a build, so it keeps the order it has.
            { pattern: '@rondo/*', group: 'external' },
          ],
          // `external` is excluded from pathGroup handling by default, which would drop the
          // rule above on the floor.
          pathGroupsExcludedImportTypes: [],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // F0.2 carry-over, closed in F0.8: register the test runner's globals on test files
    // so specs lint clean even where `no-undef` applies (plain-JS test helpers; TS files
    // get it disabled by typescript-eslint anyway). Playwright e2e specs are excluded
    // on purpose — they import `test`/`expect` instead of using globals.
    files: ['**/*.{spec,test}.{ts,tsx,js,jsx}', '**/test/**/*.{ts,tsx,js,jsx}'],
    ignores: ['**/e2e/**'],
    languageOptions: {
      globals: { ...globals.jest },
    },
  },
  prettier,
);
