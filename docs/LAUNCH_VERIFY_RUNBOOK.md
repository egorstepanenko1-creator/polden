# Проверка перед релизом (launch verification)

**Коммерческий спринт (чеклист live + ручные smokes):** `SALES_SPRINT_LIVE_CHECKLIST.md`, `SALES_SPRINT_VERIFICATION_RUNBOOK.md`.

**Ежедневный контур (7 шагов, чеклист, таблица сбоев):** `LAUNCH_BASELINE_HANDOFF.md`. Команды оператора: `OPERATOR_RUNBOOK_LAUNCH.md`. Env: `DEVELOPER_RUNBOOK_LAUNCH.md`.

Одна команда проверяет критичный базовый контур: бэкенд, защищённый KPI, публичную цепочку (через существующий smoke) и сборку CRM frontend.

## Когда запускать

- Перед деплоем бэкенда/CRM в прод.
- После значимых правок API, Prisma, лендинга или CRM UI.
- После миграций БД (убедитесь, что миграции применены и при необходимости выполнен seed).

## Что нужно заранее

1. **Node.js** ≥ 18.
2. **Запущенный** `crm-mvp` backend на ожидаемом порту (по умолчанию `http://localhost:4000`), либо укажите базу через env/флаг.
3. В каталоге **`CRM/crm-mvp/frontend`** уже выполнен `npm install` (для шага `npm run build`).

Переменные (опционально):

| Переменная | Назначение | По умолчанию |
|------------|------------|--------------|
| `POLDEN_VERIFY_API_BASE` | База API (`…/api`) | `http://localhost:4000/api` |
| `POLDEN_VERIFY_CRM_TOKEN` | Заголовок `X-CRM-Token` для KPI | `dev` (как `CRM_INTERNAL_TOKEN` в `.env` бэкенда) |
| `POLDEN_VERIFY_LANDING_ROOT` | Путь к корню авторитетного `landing-order` | `project/landing-order` относительно `project/` |

## Команды

Из каталога **`CRM/crm-mvp`**:

```bash
# Безопасно: без создания тестового заказа (smoke до quote включительно)
npm run verify:launch
```

```bash
# Полный прогон: smoke создаёт один тестовый заказ (как в landing-order/scripts/public-order-smoke.mjs без --dry-run)
npm run verify:launch:full
```

Другой хост/API:

```bash
npm run verify:launch -- --api-base https://staging.example.com/api
```

Проверка только с флагом dry-run явно:

```bash
node scripts/verify-launch.mjs --dry-run --api-base http://localhost:4000/api
```

Атрибуция в полном smoke (наследие `POLDEN_SMOKE_ATTRIBUTION`):

```bash
set POLDEN_SMOKE_ATTRIBUTION=1
npm run verify:launch:full
```

## Порядок шагов внутри verify

1. `GET /health` — `data.status === 'healthy'`.
2. `GET /api/public/branches` → первый `branchId` → `GET /api/dashboard/launch-kpis?branchId=&days=1` с `X-CRM-Token`.
3. Запуск **`project/landing-order/scripts/public-order-smoke.mjs`** (авторитетный лендинг) с тем же `--api-base` (в dry-run — с `--dry-run`). Переопределение каталога: env **`POLDEN_VERIFY_LANDING_ROOT`** — см. `docs/AUTHORITATIVE_PATHS_AND_RELEASE_TRUTH.md`.
4. Публичный hardening: **415** для quote с неверным `Content-Type`; **400 SPAM_REJECTED** при заполненном `polden_hp` (если menu-day даёт подтверждённые позиции).
5. `npm run build` в **`CRM/crm-mvp/frontend`**.

## Вывод и код выхода

- Каждый шаг: строка `[PASS] …` или `[FAIL] …`.
- В конце: **`RESULT: PASS`** или **`RESULT: FAIL`**.
- При любом `FAIL`: **код выхода 1**.

## Если что-то упало

| Симптом | Что проверить |
|---------|----------------|
| Health / connection refused | Backend запущен, порт и `POLDEN_VERIFY_API_BASE`. |
| launch-kpis 401 | `POLDEN_VERIFY_CRM_TOKEN` совпадает с `CRM_INTERNAL_TOKEN` на сервере. |
| Smoke: menu-day пусто | Seed/меню на «завтра» в БД; см. `backend` README и `npm run db:seed`. |
| Hardening: не 415 / не SPAM_REJECTED | Версия бэкенда с `publicOrderGuards`; не подменён ли `POLDEN_VERIFY_LANDING_ROOT` на неавторитетный каталог. |
| Frontend build | `cd frontend && npm install`; ошибки TypeScript/Vite в логе. |

Отдельно при необходимости: только публичный smoke из каталога **`project/`** — `node landing-order/scripts/public-order-smoke.mjs` (см. `project/landing-order/SMOKE_PUBLIC_ORDER.md`). Не путать с копией `CRM/crm-mvp/landing-order`.
