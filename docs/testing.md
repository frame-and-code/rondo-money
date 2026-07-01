# Тесты (F0.8 — тест-харнесс)

Три уровня, все запускаются через Turborepo. Правило проекта: **тесты пишутся вместе с
фичей** — фича без тестов не считается готовой (тест-долг не копим).

## Уровни

| Уровень    | Что проверяет                               | Раннер              | Где живёт                                          | Именование                 |
| ---------- | ------------------------------------------- | ------------------- | -------------------------------------------------- | -------------------------- |
| Юнит       | Доменная логика, компоненты — без БД и сети | Jest (+ fast-check) | `packages/types/test`, `apps/web/test`, `apps/api` | `*.spec.ts` / `*.test.tsx` |
| Интеграция | API ↔ Postgres (из F0.3)                    | Jest + supertest    | `apps/api/test`                                    | `*.integration.spec.ts`    |
| E2E        | Браузер → web → api → Postgres              | Playwright          | `apps/web/e2e`                                     | `*.spec.ts`                |

## Команды

```bash
pnpm test               # все уровни во всех воркспейсах (turbo run test)
pnpm test:unit          # только юнит
pnpm test:integration   # только интеграция (нужен Postgres)
pnpm test:e2e           # только e2e (нужен Postgres; серверы Playwright поднимет сам)
```

То же самое точечно: `pnpm --filter @ffai/api test:integration` и т.п.

### Предусловия

- **Интеграция и e2e** ходят в локальный Postgres из F0.3: `docker compose up -d`
  (+ `pnpm db:migrate`, если появились новые миграции).
- **E2E, один раз**: скачать браузер — `pnpm --filter @ffai/web exec playwright install chromium`.
- E2E сам собирает и стартует api (`node dist/main.js`) и web (`next dev`); уже запущенные
  локально серверы переиспользуются (`reuseExistingServer`).

## Как добавлять тесты к новой фиче

1. **Доменная логика** (деньги, бюджетные расчёты, DTO) → юнит-тест рядом с пакетом, где
   она живёт (обычно `packages/types/test/*.spec.ts`). Для инвариантов и конвенций
   пиши property-based тесты на **fast-check** — образец:
   [`packages/types/test/money.spec.ts`](../packages/types/test/money.spec.ts).
   Инвариант 5.5 (`RTA + Σ Available = Σ Balance`) с Фазы 4 проверяется именно так.
2. **Эндпоинт / работа с БД** → `apps/api/test/<фича>.integration.spec.ts`: поднимай
   реальный `AppModule` через `@nestjs/testing` + supertest — образец:
   [`apps/api/test/health.integration.spec.ts`](../apps/api/test/health.integration.spec.ts).
   Юнит-тесты api (без БД) — обычные `*.spec.ts` рядом с кодом или в `test/`.
3. **Компонент / страница** → jsdom-тест в `apps/web/test` (Testing Library).
4. **Пользовательский сценарий** (экран целиком, web + api) → `apps/web/e2e/<фича>.spec.ts` —
   образец: [`apps/web/e2e/home.spec.ts`](../apps/web/e2e/home.spec.ts). E2E — самый
   дорогой уровень: один-два сценария на фичу, остальное покрывай ниже.
5. У пакета ещё нет раннера? Скопируй `jest.config.mjs` из `packages/types` (node) или
   `apps/web` (jsdom), добавь скрипты `test` / `test:unit` — turbo подхватит их сам.

## Конвенции

- Интеграционные тесты идут **последовательно** (`--runInBand`) — общая БД, никаких гонок.
- Тест-файлы должны попадать в `include` соответствующего `tsconfig.json` — иначе
  `typecheck` и type-aware линт (`no-floating-promises` в api) их не увидят.
- Глобалы Jest (`describe` / `it` / `expect`) зарегистрированы для тест-файлов в общем
  ESLint-конфиге (`@ffai/config/eslint`); в Playwright-спеках `test`/`expect` импортируются.
- Turbo не кеширует интеграцию и e2e (состояние снаружи — БД); юнит-уровень кешируется.
