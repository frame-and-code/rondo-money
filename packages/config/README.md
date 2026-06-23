# @ffai/config

Shared eslint / tsconfig / prettier for the monorepo (F0.2). The single source of
truth — every app and package inherits from here, no local copies of rules.

## Exports

- `@ffai/config/eslint` — flat ESLint config (ESLint 9 + typescript-eslint, unified
  import rules, Prettier-compatible). Consume it from a workspace `eslint.config.mjs`:

  ```js
  import base from '@ffai/config/eslint';
  export default base;
  ```

- `@ffai/config/tsconfig/base.json` — strict (`strict: true`) TypeScript base. Consume
  it from a workspace `tsconfig.json`, declaring the `@/*` → `src/*` alias locally
  (TS resolves `paths` relative to the file that declares them, so it can't live in the
  shared base):

  ```json
  {
    "extends": "@ffai/config/tsconfig/base.json",
    "compilerOptions": { "paths": { "@/*": ["./src/*"] } },
    "include": ["src"]
  }
  ```

  Then import intra-package modules as `import { x } from '@/foo'` instead of
  `../../foo`. The shared ESLint config already groups `@/**` as internal imports.

- `@ffai/config/prettier` — Prettier options. Re-exported once from the repo root
  (`prettier.config.mjs`); Prettier then applies it across every workspace, so packages
  don't each carry their own copy.

## Scripts wired in consumers

Each workspace exposes `lint` (`eslint .`) and `typecheck` (`tsc --noEmit`); the
Turborepo gate runs them repo-wide as `turbo lint` and `turbo typecheck`.
