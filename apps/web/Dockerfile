# F0.10 — production image for @rondo/web (Next.js standalone) on Railway. Build context
# is the repo root (pnpm-workspace); the Dockerfile path is set in apps/web/railway.json.
#
# next.config.ts enables output: 'standalone' — the runner gets a self-contained
# server.js with a minimal node_modules (Next tracing), no pnpm and no workspace.

FROM node:26-slim AS base
# No cache mount for the pnpm store — see the comment in apps/api/Dockerfile (Railway
# requires a hardcoded service-id in the mount id).
ENV COREPACK_HOME=/opt/corepack
# Node 26 no longer ships corepack — install it from npm before enabling it (see the
# comment in apps/api/Dockerfile).
RUN npm install -g corepack@latest && corepack enable
WORKDIR /app

# ---- manifests: see the comment in apps/api/Dockerfile — the dependency layer
# is invalidated only by manifest changes, not code edits.
FROM base AS manifests
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/api-client/package.json packages/api-client/
COPY packages/config/package.json packages/config/
COPY packages/db/package.json packages/db/
COPY packages/types/package.json packages/types/
COPY packages/ui/package.json packages/ui/

# ---- build
FROM manifests AS build
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY . .
RUN pnpm --filter @rondo/web... rebuild
# NEXT_PUBLIC_* is inlined into the browser bundle during next build — Railway passes
# service variables as build args (an explicit ARG is required). The build task in
# turbo.json declares NEXT_PUBLIC_API_URL and the Clerk variables in env (turbo strict
# env mode).
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
# Clerk (F1.1): the publishable key is a build arg too (inlined into the bundle);
# CLERK_SECRET_KEY never enters the image — it is read at runtime from Railway service
# variables.
ARG NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
# Fast-fail: without these variables the build would "pass" and ship a bundle that cannot
# reach the api and cannot authenticate anyone — a failure that only surfaces in a browser,
# far from its cause. What counts as a valid value lives in apps/web/check-public-env.mjs
# (F1.11), shared with the web server Playwright starts, so the image and the e2e run
# cannot drift apart on it. `image` mode is the strict one: both variables are required.
RUN node apps/web/check-public-env.mjs image \
    && pnpm exec turbo run build --filter=@rondo/web

# ---- runner: the standalone bundle, no pnpm/workspace at all.
FROM node:26-slim AS runner
# HOSTNAME=0.0.0.0 — the standalone server must listen on all container interfaces.
# Railway overrides PORT with its own value; 3001 is the fallback for local runs
# (matches `next start -p 3001` from package.json). The EXPOSE below documents that local
# port only — it does not decide where Railway routes; see the comment in
# apps/api/Dockerfile for what that cost us.
ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3001
# Docker-native healthcheck — for local runs and linters (Checkov CKV_DOCKER_2).
# Railway ignores it: it has its own healthcheckPath from railway.json. No curl/wget
# in slim — we probe with Node's native fetch.
# Same path as railway.json, and `redirect: 'manual'` on purpose: this probe used to hit
# `/` and treat the result as healthy, because fetch follows redirects and Clerk's 307 to
# the sign-in page ends at a 200. The container called itself healthy while Railway, which
# does not follow redirects, failed every deploy.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/api/health',{redirect:'manual'}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
WORKDIR /app

# In a monorepo, standalone mirrors the repo structure: server.js lives in apps/web/.
# --chown=node: the server needs .next/cache (ISR/images) to be writable.
# ⚠️ Once apps/web gets a public/ — add its COPY here (standalone doesn't trace it,
# without the copy the static assets silently vanish in prod); the folder doesn't exist yet, COPY would fail.
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static apps/web/.next/static

USER node
EXPOSE 3001
CMD ["node", "apps/web/server.js"]
