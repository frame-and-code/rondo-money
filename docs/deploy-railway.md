# Railway dev server + continuous delivery (F0.10)

Dev environment on Railway: services **web**, **api**, **postgres**. A green `main`
deploys to dev automatically; Prisma migrations are applied by a pre-deploy command.
Production is separate (Phase 10).

## How it works

- **Images — Docker** (not Nixpacks): [apps/api/Dockerfile](../apps/api/Dockerfile) and
  [apps/web/Dockerfile](../apps/web/Dockerfile), build context — the repository root
  (pnpm-workspace). Build/deploy settings — config-as-code:
  [apps/api/railway.json](../apps/api/railway.json), [apps/web/railway.json](../apps/web/railway.json).
  Only environment variables and the repository binding remain in the Railway UI.
- **api** — multi-stage: prod dependencies are installed as a separate layer
  (`pnpm install --prod --filter @rondo/api...`); only `dist` and the runtime
  `node_modules` end up in the runner. The image keeps the prisma CLI, schema, and
  migrations — the pre-deploy command from railway.json runs them (shell-independent:
  `node .../prisma/build/index.js
migrate deploy --config packages/db/prisma.config.ts`), which is why `prisma` and `dotenv` are
  in `dependencies` of the `@rondo/db` package, not in dev.
- **web** — Next.js `output: 'standalone'` (see next.config.ts): the runner gets a
  self-contained `server.js` with no pnpm and no workspace. ⚠️ `NEXT_PUBLIC_API_URL`
  is baked into the browser bundle at `next build` time — the variable is passed as a
  build arg; changing the URL requires a **rebuild** of web, not a restart.
- **Local development is unchanged**: `docker-compose.yml` still starts only
  Postgres; web/api run via `pnpm dev` (bind mounts in Docker on macOS are
  slow — the images are for Railway only).

## One-time project setup in Railway

1. **New Project** → `rondo-money` (the live one is named after the product; its
   environment is `development`, and production gets its own in Phase 10); inside —
   **New → Database → PostgreSQL**.
2. **New → GitHub Repo** → this repository, service `api`:
   - Root Directory `/`, Branch `main`;
   - Settings → **Config file path**: `apps/api/railway.json`;
   - Variables: `DATABASE_URL` = `${{Postgres.DATABASE_URL}}`, `WEB_ORIGIN` = the web URL
     (step 4). Don't set `PORT` — Railway injects its own;
   - Settings → Networking → **Generate Domain** (target port 3000 — from `EXPOSE`).
3. The same repository, service `web`:
   - Root Directory `/`, Branch `main`;
   - Settings → **Config file path**: `apps/web/railway.json`;
   - Variables: `NEXT_PUBLIC_API_URL` = the api URL (https, no trailing slash),
     `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` = the Clerk keys
     (dashboard.clerk.com → API Keys; F1.1). Without the secret key every request
     500s at runtime; without the publishable key the build fast-fails;
   - Settings → Networking → **Generate Domain** (target port 3001).
4. Domains are generated after the services are created, so the cross-referencing
   variables (`WEB_ORIGIN` ↔ `NEXT_PUBLIC_API_URL`) are filled in after steps 2–3; then
   **Redeploy both** services (web must actually be rebuilt — see above).
5. **Continuous delivery**: enable **Wait for CI** on both services (Settings →
   Deploy) — Railway waits for a green gate (see [ci.md](ci.md)) and only then
   deploys; a red `main` never reaches dev.

## Custom domains

A generated `*.up.railway.app` address works, but it changes whenever a service or
environment is renamed, and it leaks the environment name into the URL. Custom domains are
added per service (Settings → Networking → Custom Domain, or `railway domain <name>`);
Railway then prints a `CNAME` target plus a `TXT` record used to verify ownership, both of
which go into the DNS zone of the domain. Certificates are issued automatically once those
records resolve — expect a few minutes between "domain is ACTIVE" and a certificate that
actually matches the name.

The naming scheme keeps the production names free while dev is the only live environment:

| Environment     | web                           | api                |
| --------------- | ----------------------------- | ------------------ |
| dev             | `dev.<domain>`                | `api.dev.<domain>` |
| prod (Phase 10) | `<domain>` and `app.<domain>` | `api.<domain>`     |

Giving dev its own subtree matters because dev redeploys on every green commit to `main`:
a production name pointing at that environment would promise stability the environment does
not have.

Two gotchas, both of which look like "the frontend cannot reach the API":

- `WEB_ORIGIN` must be the **exact** origin, scheme included (`https://dev.<domain>`), since
  CORS compares it verbatim;
- `NEXT_PUBLIC_API_URL` is a build arg, so pointing it at a new domain needs a **rebuild** —
  redeploying the existing image keeps the old value baked in.

## Environment variables (dev)

| Service | Variable                            | Value                                   | When it applies               |
| ------- | ----------------------------------- | --------------------------------------- | ----------------------------- |
| api     | `DATABASE_URL`                      | `${{Postgres.DATABASE_URL}}`            | runtime + pre-deploy          |
| api     | `WEB_ORIGIN`                        | the public web URL (exact match — CORS) | runtime                       |
| web     | `NEXT_PUBLIC_API_URL`               | the public api URL                      | **build** (baked into bundle) |
| web     | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk publishable key (`pk_...`)        | **build** (baked into bundle) |
| web     | `CLERK_SECRET_KEY`                  | Clerk secret key (`sk_...`)             | runtime (never in the image)  |

## Verification (DoD)

- `curl https://<api-url>/health` → `{"status":"ok","info":{"database":"up"}}` (200);
- web opens at the dev URL, requests to api pass preflight (CORS);
- the api deploy logs show the `prisma migrate deploy` pre-deploy step;
- merging a green PR into `main` → both services redeployed on their own.

Local dry run (the same sequence as on Railway):

```bash
docker build -f apps/api/Dockerfile -t rondo-api .
docker build -f apps/web/Dockerfile -t rondo-web \
  --build-arg NEXT_PUBLIC_API_URL=http://localhost:3100 \
  --build-arg NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...   # from apps/web/.env.local
docker compose up -d postgres
docker run --rm -e DATABASE_URL=postgresql://rondo:rondo_dev_secret@host.docker.internal:5432/rondo_dev \
  rondo-api node packages/db/node_modules/prisma/build/index.js migrate deploy \
  --config packages/db/prisma.config.ts   # pre-deploy — the same command as in railway.json
docker run -d -p 3100:3000 -e DATABASE_URL=postgresql://rondo:rondo_dev_secret@host.docker.internal:5432/rondo_dev \
  -e WEB_ORIGIN=http://localhost:3101 rondo-api
docker run -d -p 3101:3001 -e CLERK_SECRET_KEY=sk_test_... rondo-web   # from apps/web/.env.local
curl http://localhost:3100/health   # {"status":"ok","info":{"database":"up"}}
```
