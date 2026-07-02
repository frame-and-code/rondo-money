# F0.10 — прод-образ @ffai/web (Next.js standalone) для Railway. Контекст сборки —
# корень репозитория (pnpm-workspace), путь к Dockerfile задаётся в apps/web/railway.json.
#
# next.config.ts включает output: 'standalone' — runner получает самодостаточный
# server.js с минимальным node_modules (трейсинг Next), без pnpm и воркспейса.

FROM node:24-slim AS base
# Без cache mount для pnpm store — см. комментарий в apps/api/Dockerfile (Railway
# требует захардкоженный service-id в id маунта).
ENV COREPACK_HOME=/opt/corepack
RUN corepack enable
WORKDIR /app

# ---- manifests: см. комментарий в apps/api/Dockerfile — слой зависимостей
# инвалидируется только сменой манифестов, не правками кода.
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
# NEXT_PUBLIC_* вшивается в браузерный бандл на этапе next build — Railway передаёт
# переменную сервиса как build arg (нужен явный ARG). Задача build в turbo.json
# объявляет NEXT_PUBLIC_API_URL в env (строгий env-режим turbo).
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
# Fast-fail: без переменной сборка «прошла бы», но в бандл молча вшился бы
# localhost-фолбэк из lib/api/config.ts — прод-клиент ходил бы в никуда.
RUN [ -n "$NEXT_PUBLIC_API_URL" ] \
    || { echo "ERROR: build arg NEXT_PUBLIC_API_URL is required (вшивается в браузерный бандл)" >&2; exit 1; } \
    && pnpm exec turbo run build --filter=@ffai/web

# ---- runner: standalone-бандл, никакого pnpm/воркспейса.
FROM node:24-slim AS runner
# HOSTNAME=0.0.0.0 — standalone-сервер должен слушать все интерфейсы контейнера.
# PORT Railway переопределяет своим значением; 3001 — фолбэк для локального запуска
# (совпадает с `next start -p 3001` из package.json).
ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3001
# Docker-native healthcheck — для локального запуска и линтеров (Checkov CKV_DOCKER_2).
# Railway его игнорирует: там свой healthcheckPath из railway.json. curl/wget в slim
# нет — проверяем нативным fetch Node.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
WORKDIR /app

# В монорепо standalone повторяет структуру репозитория: server.js — в apps/web/.
# --chown=node: серверу нужен .next/cache (ISR/образы) с правом записи.
# ⚠️ Когда в apps/web появится public/ — добавить сюда его COPY (standalone его не
# трейсит, без копии статика молча пропадёт в проде); сейчас папки нет, COPY бы упал.
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static apps/web/.next/static

USER node
EXPOSE 3001
CMD ["node", "apps/web/server.js"]
