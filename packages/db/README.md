# @ffai/db

Слой данных: Prisma-схема, миграции и сгенерированный клиент — каркас F0.4 (Prisma 7).

Схема растёт инкрементально: каждая фаза приносит свою миграцию. F0.4 — это базовый
каркас (datasource + generator + пустая стартовая миграция `0_init`); доменные таблицы
(пользователи, бюджеты, журнал `ChangeLog`) появляются в Фазах 1–2.

## Что экспортирует

`PrismaClient` и типы из сгенерированного клиента. Prisma 7 — Rust-free: новый генератор
`prisma-client` отдаёт **TypeScript** в `src/generated/prisma` (git-ignored), поэтому
пакет компилируется в `dist` своим build-шагом (`tsc`). Типы консьюмеры берут из исходников
(`exports.types → src/index.ts`), рантайм — из `dist` (`exports.default → dist/index.js`).
Когда появится написанный руками TypeScript (Client Extension со скоупингом и репозиторий
сырых агрегатов), он живёт здесь же.

Подключение к БД в рантайме — через **driver adapter** (`@prisma/adapter-pg`), его
создаёт `PrismaService` в `apps/api`. URL в схеме больше не указывается (Prisma 7); он
живёт в `prisma.config.ts` и нужен только для Migrate.

## Скрипты

```bash
pnpm --filter @ffai/db build         # prisma generate + tsc → dist
pnpm --filter @ffai/db db:generate   # prisma generate
pnpm --filter @ffai/db db:migrate    # prisma migrate dev (нужен запущенный Postgres)
pnpm --filter @ffai/db db:deploy     # prisma migrate deploy (прод)
pnpm --filter @ffai/db db:studio     # prisma studio
```

`DATABASE_URL` подгружается из корневого `.env` прямо в `prisma.config.ts` (см.
`.env.example` и `docker-compose.yml`); на Railway — из реальных переменных окружения.
Из корня репозитория доступны короткие алиасы: `pnpm db:generate` и `pnpm db:migrate`.
