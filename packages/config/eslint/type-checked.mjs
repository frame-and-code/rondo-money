// @rondo/config/eslint/type-checked — opt-in type-aware layer.
// Deferred from F0.2 (the base is deliberately syntactic-only), enabled in F0.4 now
// that real async code exists. Adds typescript-eslint's type-checked rules plus the
// floating/misused-promise rules the single-write-point + ChangeLog principle relies on.
//
// Opt in per workspace because it needs a tsconfig and is slower than the base:
//
//   import { dirname } from 'node:path';
//   import { fileURLToPath } from 'node:url';
//   import base from '@rondo/config/eslint';
//   import typeChecked from '@rondo/config/eslint/type-checked';
//   const rootDir = dirname(fileURLToPath(import.meta.url));
//   export default [...base, ...typeChecked(rootDir)];
import tseslint from 'typescript-eslint';

/**
 * @param {string} tsconfigRootDir - the consumer config's own directory, so typescript-eslint
 *   resolves the workspace tsconfig via its project service. Derive it from
 *   `import.meta.url` (not `import.meta.dirname`, which needs Node >= 20.11).
 */
export default function typeChecked(tsconfigRootDir) {
  return tseslint.config(
    {
      files: ['**/*.ts'],
      extends: [tseslint.configs.recommendedTypeChecked],
      languageOptions: {
        parserOptions: { projectService: true, tsconfigRootDir },
      },
      rules: {
        '@typescript-eslint/no-floating-promises': 'error',
        '@typescript-eslint/no-misused-promises': 'error',
      },
    },
    {
      // Config / script files live outside the TS program — keep them type-unaware.
      files: ['**/*.{js,cjs,mjs}'],
      extends: [tseslint.configs.disableTypeChecked],
    },
  );
}
