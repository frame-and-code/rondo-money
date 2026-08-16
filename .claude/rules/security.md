# Security

## Tenant isolation without RLS (ADR-005)

Postgres row-level security is deliberately **not** used. Everything RLS would have
guaranteed is now ordinary code — and code fails silently: a forgotten `where userId`
returns someone else's money with no error anywhere. So all of this is load-bearing, not
polish:

- Every record carries `userId` (and `budgetId` where it applies).
- A guard puts `userId` in the request context; a Prisma Client Extension auto-scopes the
  registered models. A query without request context is an **error**, never an unfiltered
  read.
- **The extension does not cover `$queryRaw` / `$executeRaw`.** Raw aggregates go through
  the context-aware repository, which scopes `userId`/`budgetId` explicitly, and a lint
  rule keeps raw SQL out of everywhere else. Breaking that rule fails CI.
- A model that carries user data joins the scoped registry in the same change that creates
  it — never "in a follow-up".
- Cross-tenant tests ("user B sees nothing of user A's") are part of the DoD of every phase
  that adds domain tables, raw aggregates included.

## Secrets

- The repository is public (ADR-003), and its **whole history** is public with it. A secret
  committed once is burned even if the next commit removes it.
- `.env` and `apps/*/.env.local` stay out of git. Only `.env.example` and `*.env.local.tpl`
  are tracked, and they hold placeholders — never values.
- The pre-commit hook runs gitleaks on the staged diff and fails the commit on a hit. Do
  not route around it: `--no-verify`, `-n` and `HUSKY=0` are blocked by
  [`guard-bash.sh`](../hooks/guard-bash.sh). If the hook fires, the fix is to remove the
  secret, never to skip the scan.
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
