# @ffai/web

Фронтенд Fin Flow AI на **Next.js (App Router)** — каркас F0.5.

Сейчас здесь оболочка приложения: корневой layout, стартовая страница и заглушка
структуры роутов под будущие экраны. Полный каркас навигации — Фаза 3, UI-база
(shadcn/ui) — F0.6, типизированный API-клиент (`@ffai/api-client`) — F1 (ADR-002).

## Структура

```text
src/
  app/
    layout.tsx          # корневой layout (html/body, метаданные)
    page.tsx            # стартовая страница (показывает адрес API)
    (app)/              # route-group под будущую оболочку приложения (Фаза 3)
      layout.tsx
      budget/page.tsx   # заглушка экрана бюджета (/budget)
  lib/api/              # базовый клиент к API (адрес — из env)
```

## Запуск

```bash
pnpm --filter @ffai/web dev     # next dev на :3001 (API занимает :3000)
pnpm --filter @ffai/web build   # next build (standalone-сборка под Railway)
pnpm --filter @ffai/web start   # next start на :3001
pnpm --filter @ffai/web test    # jest — smoke-тест рендера стартовой страницы
```

## Окружение

```bash
cp apps/web/.env.example apps/web/.env.local   # один раз
```

- `NEXT_PUBLIC_API_URL` — базовый адрес `@ffai/api`. Значение инлайнится в браузерный
  бандл (`NEXT_PUBLIC_*`), по умолчанию `http://localhost:3000`. На Railway указывает
  на задеплоенный API.

## Тулинг (закрытые переносы из F0.2)

- **tsconfig:** поверх `@ffai/config/tsconfig/base.json` добавлены `jsx: preserve`,
  DOM-библиотеки и плагин `next`. База уже ESM/bundler-ориентирована — это ровно то,
  что нужно App Router, поэтому дублируем только Next-специфику.
- **Браузерные глобалы в ESLint:** общая база регистрирует только `globals.node`;
  здесь поверх неё добавлен `globals.browser` для клиентского кода (иначе `no-undef`
  на `window`/`document`).
- **Алиас `@/`:** `@/* → src/*` задан в F0.2; Next резолвит его нативно — доп. настройки
  не требуется.
