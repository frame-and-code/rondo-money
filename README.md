# Fin Flow AI

Монорепозиторий Fin Flow AI на **Turborepo + pnpm**.

Текущий этап: **Фаза 0 → F0.8 (тест-харнесс)**. Оставшиеся фичи фазы 0
(CI, деплой) подключаются в F0.9–F0.10.

## Требования

- Node.js >= 20 (рекомендуется 22 — см. `.nvmrc`)
- pnpm 11 (`corepack enable` подтянет версию из поля `packageManager`)
- Docker (Desktop / Engine) — для локальной БД

## Структура

```text
apps/
  web/        # фронтенд (Next.js App Router) — каркас в F0.5
  api/        # бэкенд (NestJS REST) — каркас в F0.4
packages/
  db/         # Prisma-схема и миграции — F0.4
  types/      # общие DTO; деньги в BigInt (минорные единицы) — с первого дня
  config/     # общие конфиги (eslint / tsconfig / prettier) — F0.2
  ui/         # общие UI-компоненты (shadcn/ui) — F0.6
```

## Локальный запуск

```bash
pnpm install      # установка всех воркспейсов
pnpm dev          # запуск приложений в режиме разработки
pnpm build        # сборка всех пакетов
pnpm lint         # линтинг
pnpm test         # тесты
```

Команды выполняются через Turborepo и параллелятся по воркспейсам.

## База данных (локально)

PostgreSQL поднимается одной командой через Docker Compose:

```bash
cp .env.example .env   # один раз: строка подключения DATABASE_URL
docker compose up -d   # поднять PostgreSQL в фоне
docker compose down    # остановить (данные сохранятся в volume)
```

Версия образа (`postgres:18`) совпадает с продакшеном на Railway. Данные лежат
в Docker volume и переживают перезапуски контейнера.

### Миграции и API (F0.4)

```bash
pnpm db:generate            # сгенерировать Prisma-клиент (также на postinstall)
pnpm db:migrate             # применить миграции к локальной БД (Postgres должен быть запущен)
pnpm --filter @ffai/api dev # запустить API; GET http://localhost:3000/health → 200
```

`DATABASE_URL` подгружается из корневого `.env` (см. `.env.example`). Подробности —
в [`apps/api`](apps/api/README.md) и [`packages/db`](packages/db/README.md).

### Web (F0.5)

```bash
cp apps/web/.env.example apps/web/.env.local   # один раз: NEXT_PUBLIC_API_URL
pnpm --filter @ffai/web dev                    # стартовая страница на http://localhost:3001
```

Подробности — в [`apps/web`](apps/web/README.md).

## Тесты (F0.8)

Три уровня — юнит / интеграция / e2e; тесты пишутся вместе с фичей:

```bash
pnpm test               # все уровни (turbo run test)
pnpm test:unit          # юнит (Jest + fast-check)
pnpm test:integration   # API ↔ Postgres (нужен docker compose up -d)
pnpm test:e2e           # Playwright: браузер → web → api → Postgres
```

Один раз перед e2e: `pnpm --filter @ffai/web exec playwright install chromium`.
Как добавлять тесты к новой фиче — в [`docs/testing.md`](docs/testing.md).
