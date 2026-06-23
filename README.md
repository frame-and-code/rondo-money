# Fin Flow AI

Монорепозиторий Fin Flow AI на **Turborepo + pnpm**.

Текущий этап: **Фаза 0 → F0.1 (каркас монорепо)**. Фреймворки, общие конфиги,
БД и CI подключаются в следующих фичах фазы 0 (F0.2–F0.10).

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

> На этапе F0.1 приложения и пакеты — пустые каркасы: `build` / `lint` / `test`
> проходят как placeholder'ы и наполняются реальной логикой в фичах F0.2–F0.10.
> Миграции Prisma и переменные окружения приложений подключаются в F0.4+
> (PRD, раздел 8.4).
