# Code quality

## Write like the file you are in

Match the surrounding naming, structure and comment density. A change that is
individually tidy but foreign to its file makes the codebase harder to read, not easier.

## Types

- No `any`, and no `as` used to silence the compiler — narrow with a guard, or fix the
  type. A cast that hides a real mismatch turns a compile error into a runtime one.
- `packages/types` owns shared DTOs; import them rather than re-declaring a shape.
- `pnpm typecheck` is part of done, not a CI afterthought.

## Errors

- Never swallow an exception. Handle it, or let it propagate with context added.
- An error message says what failed and with what input — enough to act on without a
  debugger, and without leaking internals (see [security](security.md)).
- Fail loudly on malformed input at the edge instead of coercing it into something
  plausible — the way `parseMoney` rejects a decimal string rather than truncating it.

## Comments

Comments explain **why**, not what the next line already says. The valuable comment is the
one carrying a decision, a constraint or a trap: why this timezone, why this order, why
the obvious version is wrong. Delete stale comments as readily as stale code.

## Dead code

Delete it. Nothing is kept "just in case" and nothing is commented out for later — git
remembers. A TODO without an owner and a ticket number is dead code with hope attached.

## Dependencies

A new dependency is a supply-chain decision in a public repository: prefer the platform
and what is already installed. When one is genuinely needed, say what it replaces and why
hand-rolling is worse, and pin it through the workspace's normal `pnpm add`.

## Formatting and lint

Prettier and ESLint own style; the shared configs live in `packages/config`. Don't argue
with them in review and don't restyle code by hand — run `pnpm format` and `pnpm lint`.
Disabling a lint rule inline needs a comment explaining why the rule is wrong _here_.
