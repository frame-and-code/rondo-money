# @rondo/api

Rondo Money backend on **NestJS (REST)** — skeleton F0.4, closed to anonymous callers
since F1.2.

Beyond the healthcheck there are no endpoints yet; domain modules, the single mutation
point and the single read point (scoped by `userId`/`budgetId`) are added in Phases 1–2.

## Endpoints

- `GET /health` — checks the DB connection (`SELECT 1` via Prisma). `200` if the DB
  is reachable, `503` if not. Public (see below).

`PrismaService` connects to Postgres via the `@prisma/adapter-pg` driver adapter
(Prisma 7, Rust-free client); `DATABASE_URL` comes from `ConfigService`.

## Authentication (F1.2)

Every request carries a Clerk session token as `Authorization: Bearer <jwt>`.
[`ClerkAuthGuard`](src/auth/auth.guard.ts) verifies its signature with
[`verifyToken()`](https://clerk.com/docs/guides/sessions/manual-jwt-verification) and puts
the `sub` claim on the request as `userId`; anything missing, malformed, expired or signed
by someone else is `401`, with no hint in the body about which of those it was.

- The guard is registered **globally** ([`AuthModule`](src/auth/auth.module.ts) →
  `APP_GUARD`), so a new endpoint is protected without anyone remembering to protect it.
  Opening one is an explicit [`@Public()`](src/auth/public.decorator.ts) on the handler or
  the controller — that is how `GET /health` stays reachable for Railway's anonymous probe.
- Handlers read the caller with [`@CurrentUserId()`](src/auth/current-user.decorator.ts).
  **This is the only source of identity**: a `userId` taken from the body, the query or a
  header is a request to read someone else's money, and with no RLS behind us (ADR-005)
  nothing further down would catch it.

### Configuration

| Variable           | Meaning                                                                                                |
| ------------------ | ------------------------------------------------------------------------------------------------------ |
| `CLERK_JWT_KEY`    | the instance's PEM public key — signatures are checked locally, no call to Clerk. Wins over the other. |
| `CLERK_SECRET_KEY` | resolves the instance's JWKS from Clerk (cached five minutes). Fine locally; see the warning below.    |

One of the two is **required**: with neither, the process exits at startup (`main.ts`)
instead of answering 401 to every caller. Locally the key comes from `apps/api/.env.local`,
generated from [`.env.local.tpl`](.env.local.tpl) by `pnpm env:setup`; on Railway — from
the service's variables.

⚠️ **Anywhere the API faces the internet, set `CLERK_JWT_KEY`.** On the secret-key path a
token whose `kid` is not already cached costs one outbound request to Clerk, and a miss is
never cached — so forged tokens carrying random `kid`s amplify one-for-one into JWKS
fetches until the Clerk instance is rate-limited and genuine users get 401s. The API logs a
warning at startup whenever it is running that way.

## Running

```bash
pnpm --filter @rondo/api dev     # nest start --watch (recompilation via SWC)
pnpm --filter @rondo/api build   # nest build → dist/
pnpm --filter @rondo/api start   # node dist/main.js
pnpm --filter @rondo/api test    # jest: unit, then integration (needs the local Postgres)
```

`DATABASE_URL` comes from the root `.env` (see `.env.example`) and the Clerk key from
`apps/api/.env.local`; on Railway both come from real environment variables, which take
precedence over any file. Port — `PORT` (defaults to `3000`).

CORS is scoped to the browser client's origin: `WEB_ORIGIN` (defaults to
`http://localhost:3001`, where `@rondo/web` runs locally). On Railway/prod set
the deployed web address — don't hardcode it.

## Tooling (carry-overs closed from F0.2)

- **tsconfig:** on top of `@rondo/config/tsconfig/base.json` we add `experimentalDecorators`
  / `emitDecoratorMetadata` and `module: nodenext` (resolves as CommonJS — the package has no
  `"type": "module"`). The actual build is done by SWC (`.swcrc`); `tsc` is typecheck only.
- **`@/` alias at runtime:** SWC rewrites `@/*` into relative paths at build time
  (`jsc.baseUrl` + `jsc.paths`); in tests — via Jest's `moduleNameMapper`.
- **Type-aware ESLint:** `@rondo/config/eslint/type-checked` is enabled with
  `no-floating-promises` / `no-misused-promises` — critical for atomic mutations.
