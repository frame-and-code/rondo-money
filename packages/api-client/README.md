# @rondo/api-client

The typed client for the Rondo Money API, and the only way `apps/web` talks to it (ADR-002).

## Where the types come from

Nothing here is written from knowledge of the API. The chain is:

1. `apps/api` describes itself. Response classes carry `@ApiProperty`, handlers carry
   `@ApiOkResponse`, and `@Public()` marks an endpoint as open.
2. `pnpm openapi` builds the api and boots it in preview mode to write `apps/api/openapi.json`.
   No server and no database are involved.
3. `pnpm --filter @rondo/api-client codegen` turns that file into `src/generated/`.

Both generated artefacts, `apps/api/openapi.json` and `src/generated/`, are **committed**, so
a contract change shows up as a reviewable diff. `turbo.json` wires the order, so `pnpm typecheck`
and `pnpm test` regenerate what they need on their own. `pnpm build` deliberately does not. It
consumes the committed files, which is what keeps a full NestJS build out of the web image.

Nobody runs those two commands by hand, and nobody has to remember them (F1.5). The pre-commit
hook regenerates both artefacts and adds them to the commit, so changing a response class in
`apps/api` cannot land without the client that matches it. The one case the hook refuses rather
than guesses at is a contract that moved while the sources it came from are not all staged.
What the hook does locally, the `static` job of the CI gate does as a check, with the same
script (`codegen.sh`) and the opposite ending. It fails if regenerating changed anything. See
[docs/ci.md](../../docs/ci.md).

> `src/generated/` is machine-written. Edits there are overwritten by the next run, and both
> Prettier and ESLint skip the directory. Change the NestJS code instead.

## What is generated

`@hey-api/openapi-ts` ([config](openapi-ts.config.ts)) emits four things from one spec:

- **types** for every request and response shape;
- **request functions** like `meControllerIdentify()`, one per operation, named after the NestJS
  controller and method that produced it;
- **query options** for TanStack Query, as in `useQuery(meControllerIdentifyOptions())`. Options
  rather than ready-made hooks, because they compose and the query-key design stays ours. That
  matters here because no derived value is stored (see the invariant in
  [`.claude/rules/architecture.md`](../../.claude/rules/architecture.md)), so one mutation
  invalidates RTA and every month's Available at once. They live behind the
  `@rondo/api-client/react-query` subpath so the package root does not drag
  `@tanstack/react-query` in. A script or a test that wants only the request functions and their
  types should not fail to import over a peer it never uses;
- **zod schemas** for the response shapes. Nothing parses with them yet; the first consumer is
  Phase 3, where an amount arrives as a string and has to be validated before it becomes a
  `bigint`.

The HTTP runtime is **bundled into `src/generated/`** rather than installed. That is the
supported path, since the standalone `@hey-api/client-fetch` package is deprecated in favour of
bundling. The trade-off is worth stating plainly. This repository carries ~2000 lines of the
client's runtime as generated code, so a fix in it arrives only when the generator is bumped
**and** the output regenerated. Dependabot bumps the generator; the CI drift check (F1.5) is
what turns a stale regeneration into a failing build rather than silence.

## Using it

`apps/web`'s `ApiProvider` calls `configureApiClient` once. Screens then use the
generated query options:

```tsx
import { meControllerIdentifyOptions } from '@rondo/api-client/react-query';

const { data, isError } = useQuery(meControllerIdentifyOptions());
```

The compiler checks paths, methods and response shapes against the spec, and types `data` per
endpoint. You can also call a request function directly (`await meControllerIdentify()`), which
returns `{ data }` or `{ error }`. HTTP failures are values, not exceptions.

**The token is not attached to everything.** Each generated request function carries the
`security` its operation declares in the spec, and the client resolves the token only when it
finds one. So `GET /me` gets a bearer header and the public healthcheck goes out anonymously,
without this package holding a list of which paths are open. That list would be a second source
of truth for something `@Public()` already decides in `apps/api`.

## Money

Money crosses the wire as a base-10 string of minor units, never a number. See
`packages/types/src/money.ts` for the convention and its parser. No endpoint carries money yet;
when the first one does, parse at the edge rather than passing the string on.

## Why this generator

ADR-002 left the choice of codegen tool "to be decided at implementation". It is
`@hey-api/openapi-ts`. It covers types, request functions, TanStack Query options and zod
schemas from a single spec, and it is the one tool in this category keeping up with TypeScript
(its peer range names 6 explicitly; the alternatives still pin 5).

It **crashes on TypeScript 7** (`ts.SyntaxKind` undefined); the workspace is on `^6`, so that
is a wall to check before bumping TypeScript, not a problem today.

Switching away is cheap by construction. `src/index.ts` and `src/react-query.ts` are the only
hand-written files here, and the screens depend on the generated names rather than on the
generator.
