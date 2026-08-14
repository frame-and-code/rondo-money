# F0.10 — production image for @rondo/api (NestJS) on Railway. Build context is the repo
# root (pnpm-workspace); the Dockerfile path is set in apps/api/railway.json.
#
# Stages: manifests (package.json files only — the dependency layer survives code edits) →
# build (full install + turbo build) → prod-deps (runtime dependencies only) → runner.
#
# Migrations are NOT run on container start: Railway runs them as a separate pre-deploy
# command (see railway.json) — that's why the prisma CLI, schema and migrations stay in the image.
# The command is shell-independent (bare node + --config, no cd/&&/.bin shims) and pnpm-free:
# before `run`, pnpm 11 checks node_modules against the lockfile and tries to install the
# difference, which fails in a read-only image — and corepack would pull pnpm from the network on every deploy.

FROM node:26-slim AS base
# pnpm via corepack — version comes from "packageManager" in package.json.
# Node 26 no longer ships corepack, so it is installed from npm first; keeping corepack
# (instead of `npm i -g pnpm@<version>`) keeps package.json the single source of the pnpm
# version, integrity hash included.
# No cache mount for the pnpm store: Railway requires a hardcoded
# id=s/<service-id>-… (variable substitution in id is not supported) — not worth
# tying the repo to a specific service; layered caching of manifests remains.
ENV COREPACK_HOME=/opt/corepack
# openssl already at build time: @prisma/engines picks the migration engine variant
# for the openssl it finds — without it the 1.1.x fallback gets downloaded, and the runtime (openssl 3) rejects it.
# DL3008 (version pinning) is deliberately disabled: Debian drops old versions from mirrors after
# security bumps — pinning would break deploys at a random moment with no changes in the repo.
# hadolint ignore=DL3008
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/* \
    && npm install -g corepack@latest \
    && corepack enable
WORKDIR /app

# ---- manifests: workspace manifests only — the dependency install stays cached
# as long as the dependencies themselves don't change. package.json of ALL packages
# is needed, otherwise frozen-lockfile won't match pnpm-lock.yaml.
FROM base AS manifests
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/config/package.json packages/config/
COPY packages/db/package.json packages/db/
COPY packages/types/package.json packages/types/
COPY packages/ui/package.json packages/ui/

# ---- build: all dependencies + build of api and its workspace dependencies.
# --ignore-scripts: postinstall (prisma generate) would fail on this layer — no schema yet;
# generate is run by the @rondo/db build itself (see its package.json). pnpm rebuild after
# copying the sources picks up the allowed native scripts (allowBuilds).
FROM manifests AS build
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY . .
RUN pnpm --filter @rondo/api... rebuild && pnpm exec turbo run build --filter=@rondo/api
# The prod install is not run here — the separate stage below is cached independently.

# ---- prod-deps: runtime dependencies only, for api and its workspace graph
# (incl. prisma CLI and dotenv — they live in @rondo/db dependencies for pre-deploy migrations).
# rebuild picks up the postinstall scripts cut off by --ignore-scripts: @prisma/engines
# downloads the migration engine — it must land in the image, the runtime doesn't write it.
FROM manifests AS prod-deps
RUN pnpm install --prod --frozen-lockfile --ignore-scripts --filter @rondo/api... \
    && pnpm --filter @rondo/api... rebuild

# ---- runner: the workspace node_modules layout is preserved (pnpm symlinks are relative),
# pre-deploy runs prisma from packages/db.
FROM node:26-slim AS runner
ENV NODE_ENV=production
# Docker-native healthcheck — for local runs and linters (Checkov CKV_DOCKER_2);
# hits the same GET /health as Railway (which has its own healthcheckPath from railway.json).
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# openssl is needed by the Prisma migration engine (schema engine) in pre-deploy; the slim image doesn't ship it.
# No version pin on purpose (DL3008) — see the comment in the base stage.
# hadolint ignore=DL3008
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app

COPY --from=prod-deps /app/node_modules node_modules
COPY --from=prod-deps /app/apps/api/node_modules apps/api/node_modules
COPY --from=prod-deps /app/packages/db/node_modules packages/db/node_modules
COPY apps/api/package.json apps/api/
COPY packages/db/package.json packages/db/prisma.config.ts packages/db/
COPY packages/db/prisma packages/db/prisma
COPY --from=build /app/packages/db/dist packages/db/dist
COPY --from=build /app/apps/api/dist apps/api/dist

USER node
# Railway injects PORT and the process must listen on whatever it says — main.ts reads
# process.env.PORT and only falls back to 3000 for a local run.
#
# EXPOSE documents that local port. It does NOT configure Railway, despite what the comment
# here used to claim: the platform routes to the target port recorded on the service domain,
# which is taken from EXPOSE once, when the domain is first created, and drifts on its own
# from then on. The two disagreed for a long time — the domain pointed at 3000 while the
# container listened on the 8080 Railway had injected — and every external request to the
# API answered 502 after a 30s proxy timeout, while the container's own healthcheck (which
# uses the same injected PORT) stayed green and the logs showed a perfectly healthy Nest.
# If this ever recurs, compare `railway logs` against the domain's targetPort; changing
# EXPOSE alone will not move it.
EXPOSE 3000
CMD ["node", "apps/api/dist/main.js"]
