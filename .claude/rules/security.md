# Security

## Tenant isolation without RLS (ADR-005)

Postgres row-level security is deliberately **not** used. Everything RLS would have
guaranteed is now ordinary code — and code fails silently: a forgotten `where userId`
returns someone else's money with no error anywhere. So all of this is load-bearing, not
polish:

- Every record carries `userId` (and `budgetId` where it applies).
- The guard is [`ClerkAuthGuard`](../../apps/api/src/auth/auth.guard.ts), registered
  globally: an endpoint is closed unless it carries `@Public()`, and the identity comes
  from the verified token's `sub` via `@CurrentUserId()` — **never** from the body, the
  query or a header, however convenient. Adding an endpoint adds no auth wiring; opening
  one is a decision written at the handler. The token must also carry an `azp` claim equal to
  `WEB_ORIGIN`, so one minted for another origin cannot be replayed here.
- The guard also puts `userId` into the request context
  ([`RequestContextService`](../../apps/api/src/request-context/request-context.service.ts), an
  `AsyncLocalStorage` — deliberately hand-written rather than `nestjs-cls`, which supersedes
  the plan's wording). Everything downstream reads the caller from there, so no call site can
  forget to pass it. Asking for a `userId` that is not there **throws**; it never returns
  `undefined`.
- Domain code injects the auto-scoped client
  ([`SCOPED_PRISMA`](../../apps/api/src/prisma/scoped-prisma.ts)), never `PrismaService`,
  which is the unscoped client underneath. Reads of a registered model are filtered, writes
  are stamped, and an operation with no scoping rule (`groupBy`, `aggregate`) is **refused**
  rather than run unfiltered. Prisma's types still ask for `userId` on writes — the extension
  overwrites whatever is passed, which is what makes passing the wrong one harmless. Also not
  left to memory: the lint rule `@rondo/config/eslint/unscoped-prisma` fails the gate on
  importing `PrismaService` outside `src/prisma`, `src/raw-sql` and the tests.
- The extension covers **top-level operations only**. A nested write keeps whatever `userId`
  the caller put on the nested rows, so a relation written that way (a transfer's two legs,
  F2.2) is scoped explicitly or split into separate top-level writes inside the transaction.
- A model that carries user data joins the registry
  ([`scoped-models.ts`](../../apps/api/src/prisma/scoped-models.ts)) in the same change that
  creates it — never "in a follow-up". Not left to memory: `apps/api/test/scoped-models.spec.ts`
  walks the schema and fails the gate when a model with a `userId` column is missing, and
  [`stop-scoping-drift.sh`](../hooks/stop-scoping-drift.sh) reminds before the commit. The test
  is the guarantee; the hook only fires inside a Claude Code session.
- **The extension does not cover `$queryRaw` / `$executeRaw`.** Raw SQL lives in
  [`apps/api/src/raw-sql`](../../apps/api/src/raw-sql) — `ScopedRawRepository` takes the scope
  from the request context and refuses without one; `DatabaseProbe` holds the single
  deliberately unscoped statement (the healthcheck's `SELECT 1`). Everywhere else the lint rule
  `@rondo/config/eslint/prisma-raw` fails CI. There are **no** inline exemptions: an
  `eslint-disable` here is the thing the rule exists to prevent.
- Cross-tenant tests ("user B sees nothing of user A's") are part of the DoD of every phase
  that adds domain tables, raw aggregates included. Pattern to copy:
  [`user-scoping.integration.spec.ts`](../../apps/api/test/user-scoping.integration.spec.ts).

## Secrets

- The repository is public (ADR-003), and its **whole history** is public with it. A secret
  committed once is burned even if the next commit removes it.
- `.env` and `apps/*/.env.local` stay out of git. Only `.env.example` and `*.env.local.tpl`
  are tracked, and they hold placeholders — never values.
- The pre-commit hook runs gitleaks on the staged diff and fails the commit on a hit. Do
  not route around it: `--no-verify`, `-n`, `HUSKY=0` and `git -c core.hooksPath=…` are all
  blocked by [`guard-bash.sh`](../hooks/guard-bash.sh). If the hook fires, the fix is to
  remove the secret, never to skip the scan.
- Never print a secret's value — not into the transcript, a log, an error message or a
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
- Error responses carry no internals — no stack traces, no SQL, no file paths.
- Never swallow an exception on a money path: handle it or let it propagate.
