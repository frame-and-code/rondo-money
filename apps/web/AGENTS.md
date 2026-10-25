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

- the repository rules in [`.claude/rules/`](../../.claude/rules/). The always-on ones are in
  context on every turn, [`web.md`](../../.claude/rules/web.md) loads with this workspace, and
  all of them win over anything here;
- this workspace's [`README.md`](README.md) for structure, scripts, the env contract and why
  `proxy.ts`, `lib/auth.ts` and `railway.json` have to agree on the same paths.

## What must not happen in this workspace

- **No database.** `apps/web` never imports Prisma and never reaches Postgres (ADR-002); it
  only talks to `@rondo/api` over HTTP.
- **One API path.** [`src/lib/api/client.tsx`](src/lib/api/client.tsx) configures the generated
  client and nothing else; screens read through the generated query options and the token
  attaches itself; server code never uses the module-level client. The rule and its reasons are
  in [web](../../.claude/rules/web.md), which loads with this workspace.
- **No hand-written CSS files, and an inline `style` only for a value computed per element**,
  which [web](../../.claude/rules/web.md) bounds, along with where a custom
  animation goes. Screens are Tailwind utilities plus shadcn/ui components from `@rondo/ui`,
  whose README describes the theme. Missing a primitive? Add it with
  `pnpm dlx shadcn@latest add <component>` into `packages/ui`, not here.
- **No hardcoded UI strings.** They go through `src/i18n` from the first line; the order the
  locale resolves in is written once, in [README.md](README.md).

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
