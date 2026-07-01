# CI-гейт (F0.9 — GitHub Actions)

Обязательный гейт на каждый PR: **lint → format:check → typecheck → tests**
(юнит → интеграция → e2e). Воркфлоу — [.github/workflows/ci.yml](../.github/workflows/ci.yml),
один job `gate`, шаги идут строго последовательно — красный шаг валит весь гейт.

## Как это устроено

- Все шаги — те же корневые команды, что и локально: `pnpm lint`, `pnpm typecheck`,
  `pnpm test:unit` и т.д. (см. [testing.md](testing.md)). CI не изобретает свой способ
  запуска — если гейт красный, то же самое воспроизводится локально.
- **Postgres** поднимается как service-контейнер (`postgres:18` — тот же образ, что в
  `docker-compose.yml`), перед интеграцией прогоняются миграции:
  `pnpm --filter @ffai/db run db:deploy` (`prisma migrate deploy`).
- `DATABASE_URL` задаётся через env воркфлоу — `.env`-файлов в CI нет,
  `ConfigModule` (api) и `prisma.config.ts` (db) читают `process.env`.
- **E2E**: Playwright сам собирает и стартует api и web (`reuseExistingServer` выключен
  в CI), браузер ставится шагом `playwright install --with-deps chromium`. Репортер в
  CI — `github` (аннотации прямо в PR); при падении трейсы (`apps/web/test-results`)
  загружаются артефактом `playwright-traces`.
- Запуски по PR и по push в `main`; повторный push в ту же ветку отменяет
  предыдущий запуск (`concurrency`).

## Branch protection на `main`

Мерж в `main` — только через PR с зелёным чеком `gate` (required status check,
`strict: true` — ветка должна быть обновлена относительно `main`; действует и для
админов). Красный гейт блокирует мерж; прямой push в `main` закрыт.

Настройка живёт в GitHub → Settings → Branches (или `gh api .../branches/main/protection`);
в коде её нет — при переезде репозитория перенастроить вручную.
