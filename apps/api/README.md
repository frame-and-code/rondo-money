# @ffai/api

Бэкенд Fin Flow AI на **NestJS (REST)** — каркас F0.4.

Сейчас здесь только healthcheck; доменные модули, единая точка мутаций и единая точка
чтения (со скоупингом по `userId`/`budgetId`) добавляются в Фазах 1–2.

## Эндпоинты

- `GET /health` — проверяет соединение с БД (`SELECT 1` через Prisma). `200` если БД
  доступна, `503` если нет.

`PrismaService` подключается к Postgres через driver adapter `@prisma/adapter-pg`
(Prisma 7, Rust-free клиент); `DATABASE_URL` берётся из `ConfigService`.

## Запуск

```bash
pnpm --filter @ffai/api dev     # nest start --watch (cвоё перекомпиляция через SWC)
pnpm --filter @ffai/api build   # nest build → dist/
pnpm --filter @ffai/api start   # node dist/main.js
pnpm --filter @ffai/api test    # jest (интеграционный тест healthcheck)
```

`DATABASE_URL` берётся из корневого `.env` (см. `.env.example`); на Railway —
из реальных переменных окружения. Порт — `PORT` (по умолчанию `3000`).

## Тулинг (закрытые переносы из F0.2)

- **tsconfig:** поверх `@ffai/config/tsconfig/base.json` добавлены `experimentalDecorators`
  / `emitDecoratorMetadata` и `module: nodenext` (резолвится как CommonJS — у пакета нет
  `"type": "module"`). Реальную сборку делает SWC (`.swcrc`); `tsc` — только typecheck.
- **Алиас `@/` в рантайме:** SWC переписывает `@/*` в относительные пути при сборке
  (`jsc.baseUrl` + `jsc.paths`); в тестах — через `moduleNameMapper` Jest.
- **Type-aware ESLint:** включён `@ffai/config/eslint/type-checked` с
  `no-floating-promises` / `no-misused-promises` — критично для атомарных мутаций.
