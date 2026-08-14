// @rondo/config/prettier — single source of truth for formatting (F0.2).
// The repo root re-exports this; Prettier then applies it to every workspace.
/** @type {import("prettier").Config} */
export default {
  printWidth: 100,
  tabWidth: 2,
  semi: true,
  singleQuote: true,
  trailingComma: 'all',
  arrowParens: 'always',
  endOfLine: 'lf',
};
