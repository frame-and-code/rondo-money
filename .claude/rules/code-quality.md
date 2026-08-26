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

**TypeScript and JavaScript carry no comments.** Not a short one, not a good one, not this
once. The only ones that may appear are the ones a tool reads and acts on: `eslint-disable`,
`@ts-expect-error`, `/// <reference>`, `prettier-ignore`, a JSDoc type a checker consumes, a
`@jest-environment` docblock, a coverage pragma. Those are instructions to a machine and not
prose about the code.

This is a lint rule, `rondo/no-comments` in
[`@rondo/config/eslint`](../../packages/config/eslint/no-comments.mjs), and it fails the gate.
It also fixes itself: `eslint --fix` deletes the comment. There is no inline exemption, and an
`eslint-disable` aimed at this rule is the thing the rule exists to stop.

It is absolute on purpose. The rule that stood here before allowed "one short line where the
name cannot carry the meaning", and every comment anyone wanted to write turned out to be that
case. A bound with an exception is a bound nobody meets.

What to reach for instead: a better name, a smaller function, a type that makes the wrong value
unrepresentable, an error message that says what failed with what input. A **decision** goes to
the Notion ticket that took it, never into the code and never into a second document
(see [specs](specs.md)). A **constraint a reader must not break** goes to the rule or the skill
that owns the pattern; if there is no such home, that is the signal to write one.

Two file kinds keep their comments, because there is nowhere else to put what they say and no
document can annotate them: `///` in `schema.prisma`, which Prisma emits into the generated
client, so it is output rather than commentary; and `.claude/hooks/*`, where a guard's charter
lives, meaning what it refuses and what it knowingly does not. Even there the comment states
the constraint and not its history: what breaks if you change this line, never what broke once.

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
