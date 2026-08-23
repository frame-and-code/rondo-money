# Notes for agents working in apps/web

`CLAUDE.md` next to this file is a one-line bridge (`@AGENTS.md`) that `next dev` wrote; this
file holds the actual content, and Claude Code loads it through that bridge when working here.

**Keep the managed Next.js block at the bottom.** `next dev` rewrites only what sits between
its markers and leaves the rest of this file untouched. See `writeAgentFiles` / `upsertFile`
in `node_modules/next/dist/server/lib/generate-agent-files.js`. Deleting the block does not
remove it; the next `next dev` run inside an agent session brings it back as an uncommitted
change. Its advice is also sound. Next 16 is a breaking release, and the docs it points at
really do ship inside the package (`node_modules/next/dist/docs/`).

## Read first

- the repository rules in [`.claude/rules/`](../../.claude/rules/), imported by the root
  [`CLAUDE.md`](../../CLAUDE.md). They are in context on every turn and they win over anything
  here;
- this workspace's [`README.md`](README.md) for structure, scripts, the env contract and why
  `proxy.ts`, `lib/auth.ts` and `railway.json` have to agree on the same paths.

## What must not happen in this workspace

- **No database.** `apps/web` never imports Prisma and never reaches Postgres (ADR-002); it
  only talks to `@rondo/api` over HTTP.
- **One API path.** [`src/lib/api/client.tsx`](src/lib/api/client.tsx) configures the generated
  `@rondo/api-client` (F1.4) with the base URL and the Clerk token, and provides the TanStack
  Query cache. That is all it is allowed to do. Screens fetch through the generated query
  options (`useQuery(meControllerIdentifyOptions())`), and **the token attaches itself**, so
  never set `Authorization` or call `getToken()` in a component. Do not hand-write a request
  beside them and do not add a second `fetch` path; add a missing endpoint to `apps/api` and
  regenerate, never work around it here. **Server code must not use the module-level client.**
  It is one instance per process, so configuring it during SSR would share one visitor's token
  with every concurrent request. `ApiProvider` configures it in the browser only; server code
  that needs the API builds its own client per request from `await auth()` and passes it
  explicitly, never with a bare `fetch`.
- **No hand-written CSS files and no inline `style`.** Screens are Tailwind utilities plus
  shadcn/ui components from `@rondo/ui`, whose README describes the theme. Missing a primitive?
  Add it with
  `pnpm dlx shadcn@latest add <component>` into `packages/ui`, not here.
- **No hardcoded UI strings.** They go through `src/i18n` (ru, en and pl; en is the fallback
  since F1.6) from the first line, not "once the screen works". The active locale is not a
  component's to guess. `useTranslations()` resolves it from the user's own stored pick, then
  their account settings, then the browser.
- **Money arrives as a string**, and the helpers in `@rondo/types` parse it, because JSON has no
  bigint. Never do arithmetic on the raw response value.
- **DTOs come from `@rondo/types`.** A type restated here is a second source of truth.

## Traps worth knowing

- E2E run against a **production build** (`next build` + `next start`), never `next dev`.
  Playwright builds it, and refuses to reuse a dev server that happens to be on :3001. So a
  local run costs a build (~5s when nothing changed), and a change that only breaks in
  production mode fails here rather than in CI. The refusal reads the build's mode, not its
  age, so never park a production server on that port across code changes; it would be reused
  silently. See [`docs/testing.md`](../../docs/testing.md).
- E2E needs the Clerk keys in `.env.local` (`pnpm env:setup`) and, once per machine,
  `pnpm --filter @rondo/web exec playwright install chromium`. The publishable key is inlined
  into the bundle at build time.
- The dev server is on **:3001**; :3000 belongs to the api.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
