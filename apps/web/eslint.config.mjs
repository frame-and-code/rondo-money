import base from '@rondo/config/eslint';
import globals from 'globals';

export default [
  ...base,
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
