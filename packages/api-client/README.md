# @rondo/api-client

The typed client for the Rondo Money API, and the only way `apps/web` talks to it (ADR-002).

## Where the types come from

Nothing here is written from knowledge of the API. The chain is:

1. `apps/api` describes itself — response classes carry `@ApiProperty`, handlers carry
   `@ApiOkResponse`, and `@Public()` marks an endpoint as open.
2. `pnpm openapi` builds the api and boots it in preview mode to write `apps/api/openapi.json`.
   No server and no database are involved.
3. `pnpm --filter @rondo/api-client codegen` turns that file into `src/generated/`.

Both generated artefacts — `apps/api/openapi.json` and `src/generated/` — are **committed**, so
a contract change shows up as a reviewable diff. `turbo.json` wires the order, so `pnpm typecheck`
and `pnpm test` regenerate what they need on their own. `pnpm build` deliberately does not: it
consumes the committed files, which is what keeps a full NestJS build out of the web image.

> `src/generated/` is machine-written. Edits there are overwritten by the next run, and both
> Prettier and ESLint skip the directory. Change the NestJS code instead.

## What is generated

`@hey-api/openapi-ts` ([config](openapi-ts.config.ts)) emits four things from one spec:

- **types** — every request and response shape;
- **request functions** — `meControllerIdentify()`, one per operation, named after the NestJS
  controller and method that produced it;
- **query options** for TanStack Query — `useQuery(meControllerIdentifyOptions())`. Options
  rather than ready-made hooks: they compose, and the query-key design stays ours, which matters
  here because no derived value is stored (see the invariant in
  [`.claude/rules/architecture.md`](../../.claude/rules/architecture.md)) — one mutation
  invalidates RTA and every month's Available at once. They live behind the
  `@rondo/api-client/react-query` subpath so the package root does not drag
  `@tanstack/react-query` in: a script or a test that wants only the request functions and their
  types should not fail to import over a peer it never uses;
- **zod schemas** for the response shapes. Nothing parses with them yet; the first consumer is
  Phase 3, where an amount arrives as a string and has to be validated before it becomes a
  `bigint`.

The HTTP runtime is **bundled into `src/generated/`** rather than installed. That is the
supported path — the standalone `@hey-api/client-fetch` package is deprecated in favour of
bundling — and the trade-off is worth stating plainly: ~2000 lines of the client's runtime live
in this repository as generated code, so a fix in it arrives only when the generator is bumped
**and** the output regenerated. Dependabot bumps the generator; the CI drift check (F1.5) is
what turns a stale regeneration into a failing build rather than silence.

## Using it

`configureApiClient` is called once, by `apps/web`'s `ApiProvider`. Screens then use the
generated query options:

```tsx
import { meControllerIdentifyOptions } from '@rondo/api-client/react-query';

const { data, isError } = useQuery(meControllerIdentifyOptions());
```

Paths, methods and response shapes are checked against the spec, and `data` is typed per
endpoint. Request functions can also be called directly (`await meControllerIdentify()`), which
returns `{ data }` or `{ error }` — HTTP failures are values, not exceptions.

**The token is not attached to everything.** Each generated request function carries the
`security` its operation declares in the spec, and the client resolves the token only when it
finds one. So `GET /me` gets a bearer header and the public healthcheck is called anonymously —
without this package holding a list of which paths are open. That list would be a second source
of truth for something `@Public()` already decides in `apps/api`.

## Money

Money crosses the wire as a base-10 string of minor units, never a number — see
`packages/types/src/money.ts` for the convention and its parser. No endpoint carries money yet;
when the first one does, parse at the edge rather than passing the string on.

## Why this generator

ADR-002 left the choice of codegen tool "to be decided at implementation". It is
`@hey-api/openapi-ts`: it covers types, request functions, TanStack Query options and zod
schemas from a single spec, and it is the one tool in this category keeping up with TypeScript
(its peer range names 6 explicitly; the alternatives still pin 5).

Measured on 18 Aug 2026, so that the next person can tell how stale this is:

- it releases weekly-ish — 0.97.2 (18 May), 0.98.x (1–8 Jun), 0.99.0 (22 Jun 2026);
- it **crashes on TypeScript 7** (`ts.SyntaxKind` undefined). The workspace is on `^6.0.3`, so
  this is a wall we hit only when TypeScript is bumped — check it before that bump;
- alternatives weighed: `openapi-typescript` + `openapi-fetch` (types only, ~6 kB runtime as a
  dependency — lighter, but its last release was Feb 2026 and it has no zod or query story),
  `kubb` (mid-migration: v5 core with the stable plugin line still on 4.x), `orval` (29 direct
  dependencies), and `ts-rest`, which ADR-002 named and which has not published since Mar 2025.

Switching away is cheap by construction: `src/index.ts` and `src/react-query.ts` are the only
hand-written files here, and the screens depend on the generated names rather than on the
generator.
