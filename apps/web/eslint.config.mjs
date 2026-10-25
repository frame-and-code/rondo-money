import base from '@rondo/config/eslint';
import uiLiterals from '@rondo/config/eslint/ui-literals';
import uiPrimitives from '@rondo/config/eslint/ui-primitives';
import globals from 'globals';

export default [
  ...base,
  uiPrimitives,
  uiLiterals,
  {
    ignores: ['next-env.d.ts', '.next/**'],
  },
  {
    files: ['src/**/*.{ts,tsx}', 'test/**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser },
    },
  },
];
