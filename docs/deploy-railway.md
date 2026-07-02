# Дев-сервер Railway + continuous delivery (F0.10)

Дев-окружение на Railway: сервисы **web**, **api**, **postgres**. Зелёный `main`
автоматически деплоится на дев; миграции Prisma применяются pre-deploy командой.
Прод — отдельно (Фаза 10).

## Как это устроено

- **Образы — Docker** (не Nixpacks): [apps/api/Dockerfile](../apps/api/Dockerfile) и
  [apps/web/Dockerfile](../apps/web/Dockerfile), контекст сборки — корень репозитория
  (pnpm-workspace). Настройки build/deploy — config-as-code:
  [apps/api/railway.json](../apps/api/railway.json), [apps/web/railway.json](../apps/web/railway.json).
  В UI Railway остаются только переменные окружения и привязка к репозиторию.
- **api** — multi-stage: prod-зависимости ставятся отдельным слоем
  (`pnpm install --prod --filter @ffai/api...`), в runner попадают только `dist` и
  runtime-`node_modules`. В образе остаются prisma CLI, схема и миграции — их гоняет
  pre-deploy команда из railway.json (шелл-независимая: `node .../prisma/build/index.js
migrate deploy --config packages/db/prisma.config.ts`), поэтому `prisma` и `dotenv` —
  в `dependencies` пакета `@ffai/db`, не в dev.
- **web** — Next.js `output: 'standalone'` (см. next.config.ts): runner получает
  самодостаточный `server.js` без pnpm и воркспейса. ⚠️ `NEXT_PUBLIC_API_URL`
  вшивается в браузерный бандл на этапе `next build` — переменная передаётся как
  build arg; смена URL требует **пересборки** web, не рестарта.
- **Локальная разработка не меняется**: `docker-compose.yml` по-прежнему поднимает
  только Postgres, web/api запускаются `pnpm dev` (бинд-маунты в Docker на macOS
  медленные — образы только для Railway).

## Разовая настройка проекта в Railway

1. **New Project** → `ffai-dev`; внутри — **New → Database → PostgreSQL**.
2. **New → GitHub Repo** → этот репозиторий, сервис `api`:
   - Root Directory `/`, Branch `main`;
   - Settings → **Config file path**: `apps/api/railway.json`;
   - Variables: `DATABASE_URL` = `${{Postgres.DATABASE_URL}}`, `WEB_ORIGIN` = URL web
     (шаг 4). `PORT` не задавать — Railway инжектит свой;
   - Settings → Networking → **Generate Domain** (целевой порт 3000 — из `EXPOSE`).
3. Тот же репозиторий, сервис `web`:
   - Root Directory `/`, Branch `main`;
   - Settings → **Config file path**: `apps/web/railway.json`;
   - Variables: `NEXT_PUBLIC_API_URL` = URL api (https, без завершающего слэша);
   - Settings → Networking → **Generate Domain** (целевой порт 3001).
4. Домены генерируются после создания сервисов, поэтому перекрёстные переменные
   (`WEB_ORIGIN` ↔ `NEXT_PUBLIC_API_URL`) заполняются после шага 2–3; затем **Redeploy
   обоих** сервисов (web именно пересобрать — см. выше).
5. **Continuous delivery**: у обоих сервисов включить **Wait for CI** (Settings →
   Deploy) — Railway дождётся зелёного гейта (см. [ci.md](ci.md)) и только тогда
   задеплоит; красный `main` на дев не уезжает.

## Переменные окружения (дев)

| Сервис | Переменная            | Значение                                     | Когда применяется             |
| ------ | --------------------- | -------------------------------------------- | ----------------------------- |
| api    | `DATABASE_URL`        | `${{Postgres.DATABASE_URL}}`                 | runtime + pre-deploy          |
| api    | `WEB_ORIGIN`          | публичный URL web (точное совпадение — CORS) | runtime                       |
| web    | `NEXT_PUBLIC_API_URL` | публичный URL api                            | **build** (вшивается в бандл) |

## Проверка (DoD)

- `curl https://<api-url>/health` → `{"status":"ok","info":{"database":"up"}}` (200);
- web открывается по дев-URL, запросы к api проходят preflight (CORS);
- в логах деплоя api виден pre-deploy шаг `prisma migrate deploy`;
- мерж зелёного PR в `main` → оба сервиса передеплоились сами.

Локальная репетиция (та же последовательность, что на Railway):

```bash
docker build -f apps/api/Dockerfile -t ffai-api .
docker build -f apps/web/Dockerfile --build-arg NEXT_PUBLIC_API_URL=http://localhost:3100 -t ffai-web .
docker compose up -d postgres
docker run --rm -e DATABASE_URL=postgresql://ffai:ffai_dev_secret@host.docker.internal:5432/ffai_dev \
  ffai-api node packages/db/node_modules/prisma/build/index.js migrate deploy \
  --config packages/db/prisma.config.ts   # pre-deploy — та же команда, что в railway.json
docker run -d -p 3100:3000 -e DATABASE_URL=postgresql://ffai:ffai_dev_secret@host.docker.internal:5432/ffai_dev \
  -e WEB_ORIGIN=http://localhost:3101 ffai-api
docker run -d -p 3101:3001 ffai-web
curl http://localhost:3100/health   # {"status":"ok","info":{"database":"up"}}
```
