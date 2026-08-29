import base from '@rondo/config/eslint';
import uiPrimitives from '@rondo/config/eslint/ui-primitives';
import globals from 'globals';

export default [
  ...base,
  uiPrimitives,
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
