import base from '@rondo/config/eslint';
import globals from 'globals';

export default [
  ...base,
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser },
    },
  },
];
