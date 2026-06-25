// @ffai/config/eslint/type-checked — opt-in type-aware layer.
// Deferred from F0.2 (the base is deliberately syntactic-only), enabled in F0.4 now
// that real async code exists. Adds typescript-eslint's type-checked rules plus the
// floating/misused-promise rules the single-write-point + ChangeLog principle relies on.
//
// Opt in per workspace because it needs a tsconfig and is slower than the base:
//
//   import base from '@ffai/config/eslint';
//   import typeChecked from '@ffai/config/eslint/type-checked';
//   export default [...base, ...typeChecked(import.meta.dirname)];
import tseslint from 'typescript-eslint';

/**
 * @param {string} tsconfigRootDir - pass `import.meta.dirname` from the consumer's config
 *   so typescript-eslint resolves the workspace tsconfig via its project service.
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
