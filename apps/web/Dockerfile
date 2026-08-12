# F0.10 — production image for @ffai/web (Next.js standalone) on Railway. Build context
# is the repo root (pnpm-workspace); the Dockerfile path is set in apps/web/railway.json.
#
# next.config.ts enables output: 'standalone' — the runner gets a self-contained
# server.js with a minimal node_modules (Next tracing), no pnpm and no workspace.

FROM node:26-slim AS base
# No cache mount for the pnpm store — see the comment in apps/api/Dockerfile (Railway
# requires a hardcoded service-id in the mount id).
ENV COREPACK_HOME=/opt/corepack
RUN corepack enable
WORKDIR /app

# ---- manifests: see the comment in apps/api/Dockerfile — the dependency layer
# is invalidated only by manifest changes, not code edits.
FROM base AS manifests
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/config/package.json packages/config/
COPY packages/db/package.json packages/db/
COPY packages/types/package.json packages/types/
COPY packages/ui/package.json packages/ui/

# ---- build
FROM manifests AS build
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY . .
RUN pnpm --filter @ffai/web... rebuild
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
# Fast-fail: without these variables the build would "pass", but the bundle would
# silently carry the localhost fallback from lib/api/config.ts (and with an empty Clerk
# key the middleware would fail every request at runtime).
RUN [ -n "$NEXT_PUBLIC_API_URL" ] \
    || { echo "ERROR: build arg NEXT_PUBLIC_API_URL is required (inlined into the browser bundle)" >&2; exit 1; } \
    && [ -n "$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY" ] \
    || { echo "ERROR: build arg NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is required (inlined into the browser bundle)" >&2; exit 1; } \
    && pnpm exec turbo run build --filter=@ffai/web

# ---- runner: the standalone bundle, no pnpm/workspace at all.
FROM node:26-slim AS runner
# HOSTNAME=0.0.0.0 — the standalone server must listen on all container interfaces.
# Railway overrides PORT with its own value; 3001 is the fallback for local runs
# (matches `next start -p 3001` from package.json).
ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3001
# Docker-native healthcheck — for local runs and linters (Checkov CKV_DOCKER_2).
# Railway ignores it: it has its own healthcheckPath from railway.json. No curl/wget
# in slim — we probe with Node's native fetch.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
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
