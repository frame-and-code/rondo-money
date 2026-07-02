# F0.10 — прод-образ @ffai/api (NestJS) для Railway. Контекст сборки — корень репозитория
# (pnpm-workspace), путь к Dockerfile задаётся в apps/api/railway.json.
#
# Стадии: manifests (только package.json'ы — слой зависимостей переживает правки кода) →
# build (полная установка + turbo build) → prod-deps (только runtime-зависимости) → runner.
#
# Миграции НЕ запускаются на старте контейнера: Railway гоняет их отдельной pre-deploy
# командой `cd packages/db && node_modules/.bin/prisma migrate deploy` (см. railway.json) —
# поэтому в образе остаются prisma CLI, схема и папка миграций. prisma CLI зовём напрямую,
# без pnpm: pnpm 11 перед `run` сверяет node_modules с lockfile и пытается доустановить,
# что в read-only образе падает, — а corepack тянул бы pnpm из сети на каждый деплой.

FROM node:24-slim AS base
# pnpm через corepack — версия из "packageManager" в package.json.
ENV COREPACK_HOME=/opt/corepack \
    npm_config_store_dir=/pnpm/store
# openssl уже на этапе сборки: @prisma/engines подбирает вариант движка миграций под
# найденный openssl — без него скачается фолбэк 1.1.x, а рантайм (openssl 3) его отвергнет.
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable
WORKDIR /app

# ---- manifests: только манифесты воркспейса — установка зависимостей кэшируется,
# пока не меняются сами зависимости. Нужны package.json ВСЕХ пакетов, иначе
# frozen-lockfile не сойдётся с pnpm-lock.yaml.
FROM base AS manifests
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/config/package.json packages/config/
COPY packages/db/package.json packages/db/
COPY packages/types/package.json packages/types/
COPY packages/ui/package.json packages/ui/

# ---- build: все зависимости + сборка api и его workspace-зависимостей.
# --ignore-scripts: postinstall (prisma generate) на этом слое упал бы — схемы ещё нет;
# generate выполнит сам build @ffai/db (см. его package.json). pnpm rebuild после
# копирования исходников добирает разрешённые нативные скрипты (allowBuilds).
FROM manifests AS build
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts
COPY . .
RUN pnpm -r rebuild && pnpm exec turbo run build --filter=@ffai/api
# Прогон prod-установки здесь же не делаем — отдельная стадия ниже кэшируется независимо.

# ---- prod-deps: только runtime-зависимости api и его workspace-графа
# (в т.ч. prisma CLI и dotenv — они в dependencies @ffai/db ради pre-deploy миграций).
# rebuild добирает postinstall-скрипты, срезанные --ignore-scripts: @prisma/engines
# скачивает движок миграций — он должен попасть в образ, рантайм его не пишет.
FROM manifests AS prod-deps
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --prod --frozen-lockfile --ignore-scripts --filter @ffai/api... \
    && pnpm --filter @ffai/api... rebuild

# ---- runner: воркспейс-структура node_modules сохранена (pnpm-симлинки относительные),
# pre-deploy запускает prisma из packages/db.
FROM node:24-slim AS runner
ENV NODE_ENV=production
# openssl нужен движку миграций Prisma (schema engine) в pre-deploy; slim-образ его не несёт.
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
# PORT инжектит Railway (main.ts читает process.env.PORT, фолбэк 3000);
# EXPOSE подсказывает Railway целевой порт.
EXPOSE 3000
CMD ["node", "apps/api/dist/main.js"]
