// F0.2 carry-over (closed in F0.6): the shared base only registers `globals.node`;
// components touch `window`/`document`/etc., which would otherwise trip `no-undef`.
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
