# Security

## Tenant isolation without RLS (ADR-005)

Row-level security is deliberately not used, so everything it would have guaranteed is
ordinary code, and code fails silently. Every record carries `userId` (and `budgetId` where it
applies). The guard ([`ClerkAuthGuard`](../../apps/api/src/auth/auth.guard.ts)) is global: an
endpoint is closed unless it carries `@Public()`, the identity comes from the verified token's
`sub` via `@CurrentUserId()` and never from the request, and the token's `azp` must equal
`WEB_ORIGIN`. Domain code reads through the auto-scoped client, raw SQL only through the
scoped repository, a new model joins the registry with a cross-tenant test in the same change,
and lint fails the gate on the unscoped spellings. The mechanics are in [api](api.md).

## Secrets

- The repository and its whole history are public (ADR-003). A secret committed once is
  burned even if the next commit removes it.
- `.env` and `apps/*/.env.local` stay out of git; only `.env.example` and `*.env.local.tpl` are
  tracked, with placeholders.
- The pre-commit hook runs gitleaks on the staged diff. Do not route around it;
  [`guard-bash.sh`](../hooks/guard-bash.sh) blocks `--no-verify` and its spellings, and the CI
  `secrets` job scans the whole history ([`docs/ci.md`](../../docs/ci.md)). If the hook fires,
  remove the secret.
- Never print a secret's value, not even to check it. Read the variable's name.

## Destructive database commands

`prisma migrate reset` / `deploy`, `db push`, `db execute` and raw `DROP` are allowed against
the local database only; [`guard-db.sh`](../hooks/guard-db.sh) blocks them elsewhere.
Migrations on dev or prod run through the deployment pipeline.

## Input and errors

- Validate at the boundary. Every API input is a DTO class checked by the global pipe, which
  whitelists and refuses undeclared fields; nothing downstream re-checks. Every free-text
  string field carries `@Length` with an upper bound, because the pipe does not bound one on
  its own; a field with a shape of its own (money, month, date, currency, zone, uuid) is
  bounded by the decorator that publishes it. A `@Body()` typed as
  an interface is skipped in silence, so the class is a security condition, not style.
- Error responses carry no internals: no stack traces, no SQL, no file paths.
- Never swallow an exception on a money path.
