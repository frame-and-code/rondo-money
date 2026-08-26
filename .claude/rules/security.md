# Security

## Tenant isolation without RLS (ADR-005)

Postgres row-level security is deliberately **not** used. Everything RLS would have
guaranteed is now ordinary code, and code fails silently. A forgotten `where userId`
returns someone else's money with no error anywhere. So all of this is load-bearing, not
polish:

- Every record carries `userId` (and `budgetId` where it applies).
- The guard is [`ClerkAuthGuard`](../../apps/api/src/auth/auth.guard.ts), registered
  globally. An endpoint is closed unless it carries `@Public()`, and the identity comes
  from the verified token's `sub` via `@CurrentUserId()`, **never** from the body, the
  query or a header, however convenient. Adding an endpoint adds no auth wiring; opening
  one is a decision written at the handler. The token must also carry an `azp` claim equal to
  `WEB_ORIGIN`, so one minted for another origin cannot be replayed here.
- The guard also puts `userId` into the request context
  ([`RequestContextService`](../../apps/api/src/request-context/request-context.service.ts), an
  `AsyncLocalStorage`, deliberately hand-written rather than `nestjs-cls`, which supersedes
  the plan's wording). Everything downstream reads the caller from there, so no call site can
  forget to pass it. Asking for a `userId` that is not there **throws**; it never returns
  `undefined`.
- **Inside a mutation, the client the mutation hands out is the only one that may be used.**
  Domain code holds `SCOPED_PRISMA`, which refuses **any** operation on a scoped model while a
  mutation is open: issued on the pooled connection, a write would commit on its own and
  survive the rollback, and a read would answer from before the transaction started. The
  refusal is by operation rather than by a list of the writes, so an operation a later Prisma
  release adds is refused rather than missed. `MutationService` opens its transaction from
  `MUTATOR_PRISMA`, the same scoping without that refusal, so the client it hands to a
  mutation's work accepts what the boundary refuses. A spec that exercises scoping on a write
  holds the lower client for the same reason. Not left to memory either: the restriction `mutator-prisma`, composed into
  `@rondo/config/eslint/tenant-isolation`, fails the gate on importing `MUTATOR_PRISMA` outside
  `src/prisma`, `src/mutations` and the tests.
- Domain code injects the auto-scoped client
  ([`SCOPED_PRISMA`](../../apps/api/src/prisma/scoped-prisma.ts)), never `PrismaService`,
  which is the unscoped client underneath. Reads of a registered model are filtered, and
  writes are stamped on **both** halves: the `where` stops you reading another tenant's row,
  and stamping `data` stops `update({ data: { userId: <someone else> } })` handing your own row
  away. An operation with no scoping rule of its own (`groupBy`, `aggregate`) is **refused
  unless the caller scoped it explicitly**. The catch-all reads the operation's `where` and
  lets it run when that `where` names the caller, and the active budget too on a model a budget
  owns; anything else throws. So these operations are usable, just never by accident. The
  client is built once at startup, and that is safe, because the extension reads the caller at
  query time, not at construction. Prisma's unchecked write input still asks for `userId`. The
  extension overwrites whatever is passed, which is what makes passing the wrong one harmless.
  Its checked input is the one to stay away from: on a model whose budget relation carries
  `userId`, that input drops the field, so a payload naming parents with `connect` and a
  stamped `userId` matches neither form and Prisma refuses it at runtime. Pass the ids flat.
  Also not left to memory: the restriction `unscoped-prisma`, composed into
  `@rondo/config/eslint/tenant-isolation`, fails the gate on importing `PrismaService` outside
  `src/prisma`, `src/raw-sql` and the tests. Every restriction on one ESLint rule reaches a file
  in a single object, because flat config replaces a rule's options rather than merging them and
  two blocks would leave only the last standing, in silence. That holds for
  `no-restricted-imports` and for `no-restricted-syntax` alike, which is why
  `tenant-isolation.mjs` composes the raw-SQL and assignment-write guards together rather than
  declaring a block each.
- **A model a budget owns is filtered by `budgetId` as well.** The active budget is the
  caller's one `active` budget row, looked up by the extension itself on the first query that
  needs it and remembered for the rest of the request, so a request that reads nothing a budget
  owns makes no such query at all. The lookup runs on the transaction in flight when there is
  one: issued on the pooled client it would take a second connection and read committed state,
  so a mutation that has just created the caller's first budget would be told they have none. An operation issued when the caller has none is refused
  rather than reaching every budget the caller owns. The filter
  covers reads and the writes that pick out existing rows: `update`, `updateMany`,
  `updateManyAndReturn`, `delete`, `deleteMany` and the `where` half of an `upsert`, none of
  which names a budget anywhere, so without it the rows a caller may change are wider than the
  rows they may see. The writes that create rows do not get it and must not. `create`,
  `createMany`, `createManyAndReturn` and an `upsert`'s `create` half take their budget from
  the payload, because the request that creates a budget
  carries the id of a budget that did not exist when the request started, and so does every
  group and category written beside it. The extension never stamps a budget onto a payload.
  Asking the context for the budget returns nothing instead of throwing, unlike asking for
  the caller: a user who is still creating their first budget has none.
  **A user has at most one active budget and the schema holds that**
  ([`packages/db`](../../packages/db/README.md)), which is what lets the resolver ask for one
  row instead of choosing among several. Activating a second one is a failed write, not a
  state a reader has to handle.
  Two things the extension does not do. It never checks that a `budgetId`, `accountId` or
  `categoryId` in a payload belongs to the caller, and what closes that is the schema rather
  than the caller: every child names its parent through a composite foreign key, so a row
  cannot reach a parent from another budget or another owner
  ([`packages/db`](../../packages/db/README.md)). And it does not reach raw SQL at all:
  `ScopedRawRepository` supplies `userId` and nothing else, so a hand-written aggregate adds
  the budget itself. Its `execute` is the raw write path: it refuses outside a mutation and takes that
  mutation's client as a required argument. `query` reads, and inside a mutation it refuses
  the pooled client the same way. What neither can catch is a write spelled as a `$queryRaw`,
  since Postgres runs one happily, so that one rests on review.
- The extension covers **top-level operations only**. A nested write keeps whatever `userId`
  the caller put on the nested rows, so a relation written that way (a transfer's two legs) is
  scoped explicitly or split into separate top-level writes inside the transaction. The
  composite foreign keys refuse the row that names another owner, which makes this a failed
  write rather than a leak, but the payload is still the caller's to get right.
- A model that carries user data joins the registry
  ([`scoped-models.ts`](../../apps/api/src/prisma/scoped-models.ts)) in the same change that
  creates it, never "in a follow-up", and a model one budget owns joins the second registry in
  that file beside it. Not left to memory: `apps/api/test/scoped-models.spec.ts`
  walks the schema and fails the gate when a model carrying `userId` or `budgetId` is missing
  from the registry that covers it, and
  [`stop-scoping-drift.sh`](../hooks/stop-scoping-drift.sh) reminds before the commit. The test
  is the guarantee; the hook only fires inside a Claude Code session.
- **The extension does not cover `$queryRaw` / `$executeRaw`.** The code that runs raw SQL
  lives in [`apps/api/src/raw-sql`](../../apps/api/src/raw-sql), and the statement it runs is
  built beside the module it serves, as a function returning `Prisma.Sql`
  ([`aggregate-query`](../skills/aggregate-query/SKILL.md)). `ScopedRawRepository` takes the scope
  from the request context and refuses without one; `DatabaseProbe` holds the single
  deliberately unscoped statement (the healthcheck's `SELECT 1`). Everywhere else the
  restriction `prisma-raw`, composed into `@rondo/config/eslint/tenant-isolation`, fails CI.
  There are **no** inline exemptions. An
  `eslint-disable` here is the thing the rule exists to prevent.
- Cross-tenant tests ("user B sees nothing of user A's") are part of the DoD of every phase
  that adds domain tables, raw aggregates included. Pattern to copy:
  [`user-scoping.integration.spec.ts`](../../apps/api/test/user-scoping.integration.spec.ts).

## Secrets

- The repository is public (ADR-003), and its **whole history** is public with it. A secret
  committed once is burned even if the next commit removes it.
- `.env` and `apps/*/.env.local` stay out of git. Only `.env.example` and `*.env.local.tpl`
  are tracked, and they hold placeholders, never values.
- The pre-commit hook runs gitleaks on the staged diff and fails the commit on a hit. Do
  not route around it. [`guard-bash.sh`](../hooks/guard-bash.sh) blocks `--no-verify`, `-n`
  and the bundles it hides in (`-nm`, `-anm`), `HUSKY=0` and both `core.hooksPath` spellings.
  It tokenises the command the way a shell does and matches words rather than text, so
  quoting, grouping, keywords, wrappers, and a command string handed to `eval` or a shell's
  `-c` change nothing. **It refuses accidents, not a determined bypass**, and
  [`guard-bash.mjs`](../hooks/guard-bash.mjs) lists the deliberate spellings that reach the
  same acts anyway: `$VAR` in place of a literal, a git alias, `GIT_CONFIG_KEY_*`, an encoded
  string, a script file, a heredoc body, another machine. Each takes a keystroke nobody types
  by accident, and closing them means re-implementing the shell. So it is the early layer and
  not the guarantee. **The layer that cannot be talked round is the CI `secrets` job**, which
  scans the whole history on every PR and is what actually keeps a secret out of `main` (see
  [`docs/ci.md`](../../docs/ci.md)). If the hook fires, the fix is to remove the secret, never
  to skip the scan.
- Never print a secret's value, not into the transcript, a log, an error message or a
  document, not even "to check it". Read the variable's _name_; leave the value alone.
- `pnpm scan:secrets` scans the whole history.

## Destructive database commands

`prisma migrate reset` / `deploy`, `db push`, `db execute` and raw `DROP` are allowed
against the **local** database only. [`guard-db.sh`](../hooks/guard-db.sh) blocks them when
`DATABASE_URL` points anywhere else. Migrations on dev or prod run through the deployment
pipeline, not from a developer's shell.

## Input and errors

- Validate at the boundary: every API input is parsed against a schema, unexpected fields
  are rejected, strings are bounded. Nothing downstream re-checks what the edge let in.
  That is a mechanism rather than an intention. The global `ValidationPipe`
  ([`validation.options.ts`](../../apps/api/src/validation/validation.options.ts)) whitelists
  and refuses undeclared fields, so a DTO is the whole statement of what an endpoint accepts,
  and adding an endpoint adds no validation wiring.
- **The DTO must be a class, and that is a security condition rather than a style one.** A
  `@Body()` typed as an interface or a plain object compiles to the metatype `Object`, which
  the pipe skips. `whitelist` and `forbidNonWhitelisted` never run, undeclared fields reach the
  handler, and nothing anywhere says so. Unlike `@Public()`, which is a decision written at the
  handler and readable there, this weakens the boundary by omission.
- Error responses carry no internals: no stack traces, no SQL, no file paths.
- Never swallow an exception on a money path. Handle it, or let it propagate.
