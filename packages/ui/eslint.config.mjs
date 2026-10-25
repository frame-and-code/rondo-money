import base from '@rondo/config/eslint';
import uiLiterals from '@rondo/config/eslint/ui-literals';
import globals from 'globals';

export default [
  ...base,
  uiLiterals,
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser },
    },
  },
];
