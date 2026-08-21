---
description: Bring the local environment up (Postgres, migrations, api and web) and report what is actually running.
---

# Dev

Start everything needed to work on the app locally, in dependency order, and stop at the
first step that fails rather than reporting a green stack that isn't.

## Steps

1. **Database.** `docker compose up -d`, then confirm the container is actually up
   (`docker compose ps`). Postgres 18, published on `127.0.0.1:5432` only.
2. **Migrations.** `pnpm db:migrate` if `packages/db/prisma/migrations/` has anything the
   local database has not seen. `DATABASE_URL` comes from the root `.env`; if that file is
   missing, tell the user to run `pnpm env:setup` (or copy `.env.example`) and stop.
3. **API.** `pnpm dev --filter=@rondo/api` **started in the background**. It is a watch
   process that never exits, so in the foreground the run hangs and the health check below is
   never reached. Through turbo, never `pnpm --filter @rondo/api dev`, because turbo builds
   the packages first and brings their watchers up alongside the server
   ([`apps/api/README.md`](../../apps/api/README.md)).
   Then poll `GET http://localhost:3000/health` until it answers 200, with a bounded wait.
   If it has not come up in about 30 seconds, read the server output and report the actual
   error rather than waiting longer.
   Since F1.2 the api also needs a Clerk key in `apps/api/.env.local` and **exits at
   startup** without one (`assertClerkVerificationConfigured`). That death is instant, so
   don't spend the 30 seconds on it. If the health check fails, read the output first. On
   that error the answer is `pnpm env:setup`, exactly as for web below.
4. **Web.** Start it through `preview_start` with the `web` configuration from
   `.claude/launch.json` (port 3001), never with a raw `pnpm dev` in Bash. Without Clerk
   keys in `apps/web/.env.local` every request fails. Say so and point at
   `pnpm env:setup` rather than working around it.

## Report

State what is running and on which port, and anything that failed with the actual error.
If the web app needs keys the user has not set, that is the headline, not a footnote.
