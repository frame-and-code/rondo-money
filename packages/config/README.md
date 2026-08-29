# @rondo/config

Shared eslint / tsconfig / prettier for the monorepo (F0.2). The single source of
truth. Every app and package inherits from here, no local copies of rules.

## Exports

- `@rondo/config/eslint` is the flat ESLint config (ESLint 10 + typescript-eslint, unified
  import rules, Prettier-compatible). It carries `rondo/no-comments`, which refuses a comment
  in TypeScript and JavaScript that no tool reads
  ([code quality](../../.claude/rules/code-quality.md)) and deletes it under `--fix`. Consume it
  from a workspace `eslint.config.mjs`:

  ```js
  import base from '@rondo/config/eslint';
  export default base;
  ```

- `@rondo/config/eslint/ui-primitives` refuses a bare `<select>`, `<input>`, `<textarea>` or
  `<dialog>` in JSX and names the `@rondo/ui` component to use instead. It is composed on top of
  the base in `apps/web`, where the screens live. A field inside a composed control is no
  exception: `InputGroupInput` and `InputGroupTextarea` are the ones that strip the primitive's
  own frame, which is what a hand-written element was reaching for.

- `@rondo/config/tsconfig/base.json` is the strict (`strict: true`) TypeScript base. Consume
  it from a workspace `tsconfig.json`, declaring the `@/*` → `src/*` alias locally
  (TS resolves `paths` relative to the file that declares them, so it can't live in the
  shared base):

  ```json
  {
    "extends": "@rondo/config/tsconfig/base.json",
    "compilerOptions": { "paths": { "@/*": ["./src/*"] } },
    "include": ["src"]
  }
  ```

  Then import intra-package modules as `import { x } from '@/foo'` instead of
  `../../foo`. The shared ESLint config already groups `@/**` as internal imports.

- `@rondo/config/prettier` holds the Prettier options. Re-exported once from the repo root
  (`prettier.config.mjs`); Prettier then applies it across every workspace, so packages
  don't each carry their own copy.

## Scripts wired in consumers

Each workspace that ships code exposes `lint` (`eslint .`) and `typecheck` (`tsc --noEmit`);
this package exposes `lint` but no `typecheck`, because it is static configuration. The
Turborepo gate runs them repo-wide as `turbo lint` and `turbo typecheck`.
