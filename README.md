# CRM MVP (Полдень)

Минимальный бэкенд и CRM-фронт для публичных заказов доставки (`/api/public/delivery-orders*`), меню на день и атрибуции (UTM).

## Структура

- `backend/` — Express + Prisma (SQLite по умолчанию)
- `frontend/` — Vite + React (список заказов и атрибуция)
- `docs/` — runbooks и спецификации; **Kitchen Economics v1 (English):** [spec](docs/KITCHEN_ECONOMICS_V1_SPEC.md), [entities](docs/KITCHEN_ECONOMICS_V1_ENTITIES.md), [backend implementation notes](docs/KITCHEN_ECONOMICS_IMPLEMENTATION.md)

## Быстрый старт

```bash
cd CRM/crm-mvp/backend
cp .env.example .env
npm install
npx prisma migrate deploy
npm run db:seed   # опционально: демо-точка и меню на завтра
npm run db:seed:kitchen   # демо рецепт + цены для food cost (см. docs/KITCHEN_ECONOMICS_IMPLEMENTATION.md)
npm run test:food-cost    # проверка foodCostKopeks на демо-версии
npm run dev       # порт 4000
```

Файл SQLite по умолчанию: `backend/prisma/dev.db` (путь от `DATABASE_URL=file:./dev.db` в схеме Prisma).

В другом терминале:

```bash
cd CRM/crm-mvp/frontend
cp .env.example .env
npm install
npm run dev       # порт 5173, прокси /api → 4000
```

Проверка цепочки (из каталога **`project/`** репозитория; авторитетный лендинг — **`project/landing-order`**, см. `docs/AUTHORITATIVE_PATHS_AND_RELEASE_TRUTH.md`):

```bash
node landing-order/scripts/public-order-smoke.mjs --api-base http://localhost:4000/api
```

С атрибуцией:

```bash
set POLDEN_SMOKE_ATTRIBUTION=1
node landing-order/scripts/public-order-smoke.mjs --api-base http://localhost:4000/api
```

## Внутренний API (CRM)

`GET /api/delivery-orders?branchId=&date=YYYY-MM-DD` — заголовок `X-CRM-Token` (см. `CRM_INTERNAL_TOKEN` в `.env` бэкенда, по умолчанию `dev`).

Ответ: заказы с полем `attribution` (объект или `null`).

`GET /api/dashboard/launch-kpis?branchId=&days=7` — KPI запуска за последние `days` календарных дней (включая сегодня по часовому поясу сервера), фильтр по `createdAt`. Тот же заголовок `X-CRM-Token`. В ответе: итоги заказов/выручки/AOV, разбивка по `deliveryDate`, топ источников, лента последних заказов.

## Проверка перед релизом

Из каталога `CRM/crm-mvp`: **`npm run verify:launch`** (без POST заказа) и **`npm run verify:launch:full`**. Подробности: **[docs/LAUNCH_VERIFY_RUNBOOK.md](docs/LAUNCH_VERIFY_RUNBOOK.md)**.
