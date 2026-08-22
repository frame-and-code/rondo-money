# Code quality

## Write like the file you are in

Match the surrounding naming and structure. A change that is individually tidy but foreign
to its file makes the codebase harder to read, not easier.

## Types

- No `any`, and no `as` used to silence the compiler. Narrow with a guard, or fix the
  type. A cast that hides a real mismatch turns a compile error into a runtime one.
- `packages/types` owns shared DTOs; import them rather than re-declaring a shape.
- `pnpm typecheck` is part of done, not a CI afterthought.

## Errors

- Never swallow an exception. Handle it, or let it propagate with context added.
- An error message says what failed and with what input. That is enough to act on without a
  debugger, and without leaking internals (see [security](security.md)).
- Fail loudly on malformed input at the edge instead of coercing it into something
  plausible, the way `parseMoney` rejects a decimal string rather than truncating it.

## Comments

Almost none. Code is the only description of itself that cannot go out of date, and a
comment is a second copy nobody recompiles.

- **No decisions in code.** The Notion ticket that decided it owns why an approach was
  chosen, what was rejected, what a measurement showed and which ADR applies. Not a
  comment, and not a second document either (see [specs](specs.md)).
- **What may stay is what a machine reads**: an `eslint-disable` carries why the rule is
  wrong here, a `@ts-expect-error` carries what it expects, a pragma is not a comment.
- **A field or constant whose meaning its name cannot carry** may take one short line. That
  is the ordinary case, and it is the only one.
- Everywhere else, reach for the fix instead: a better name, a smaller function, a type that
  makes the wrong value unrepresentable, an error message that says what failed.
- Never a comment that narrates the next line, repeats the file name, records what used to be
  here, or dates itself to a version. Git remembers, and Notion decides.
- **A file a tool reads and no document can annotate** keeps its comments, because there is
  nowhere else to put the constraint. That covers `///` in `schema.prisma`, which Prisma emits
  into the generated client; the JSONC in each `tsconfig.json`; `.claude/hooks/*`, where a
  guard's charter lives, meaning what it refuses and what it knowingly does not; and the build
  and workspace files, `Dockerfile`, `pnpm-workspace.yaml`, `sonar-project.properties`,
  `.gitignore` and their neighbours. The test is whether any document could carry the
  constraint instead. Even there the comment states the constraint and not its history: what breaks if
  you change this line, never what broke once.

## Dead code

Delete it. Nothing is kept "just in case" and nothing is commented out for later. Git
remembers. A TODO without an owner and a ticket number is dead code with hope attached.

## Dependencies

A new dependency is a supply-chain decision in a public repository. Prefer the platform
and what is already installed. When one is genuinely needed, say what it replaces and why
hand-rolling is worse, and pin it through the workspace's normal `pnpm add`.

## Formatting and lint

Prettier and ESLint own style; the shared configs live in `packages/config`. Don't argue
with them in review and don't restyle code by hand. Run `pnpm format` and `pnpm lint`.
