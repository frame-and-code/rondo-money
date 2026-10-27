# Code quality

- Match the surrounding naming and structure. A tidy change foreign to its file makes the
  codebase harder to read.
- No `any`, and no `as` used to silence the compiler. Narrow with a guard or fix the type.
- Never swallow an exception. An error message says what failed and with what input, without
  leaking internals. Fail loudly on malformed input at the edge instead of coercing it.
- TypeScript and JavaScript carry no comments, not one. Only what a tool reads stays
  (`eslint-disable` outside `apps/api`, whose lint refuses every directive ([api](api.md)),
  `@ts-expect-error`, `/// <reference>`, `prettier-ignore`, a JSDoc type a
  checker consumes, a `@jest-environment` docblock, a coverage pragma). `rondo/no-comments` in
  [`@rondo/config/eslint`](../../packages/config/eslint/no-comments.mjs) fails the gate and
  deletes the comment under `--fix`; an `eslint-disable` aimed at it is the thing it exists to
  stop. Reach for a better name, a smaller function or a type instead. A decision goes to the
  Notion ticket; a constraint goes to the rule or skill that owns the pattern. `///` in
  `schema.prisma` and the charter headers in `.claude/hooks/*` are the two exceptions, and even
  there a comment states the constraint, never its history.
- Delete dead code. Nothing is kept "just in case" or commented out for later. A TODO without
  an owner and a ticket is dead code.
- A new dependency is a supply-chain decision in a public repository. Prefer the platform and
  what is installed; when one is needed, say what it replaces, and add it through `pnpm add`.
- Prettier and ESLint own style. Run `pnpm format` and `pnpm lint`; do not restyle by hand.
- `pnpm typecheck` is part of done.
