# Smoke-check публичного заказа (лендинг)

**Авторитетная копия этого дерева:** `project/landing-order` (не `CRM/crm-mvp/landing-order`). Подробности: `CRM/crm-mvp/docs/AUTHORITATIVE_PATHS_AND_RELEASE_TRUTH.md`.

Повторяемая проверка базовой цепочки, от которой зависит `landing-order/index.html`:

1. `GET /health` — доступность API (база без `/api`).
2. `GET /api/public/branches` — список точек.
3. `GET /api/public/menu-day?branchId=&date=` — меню на **завтра**; наличие хотя бы одной позиции с непустым именем (как «live» на лендинге).
4. `POST /api/public/delivery-orders/quote` — расчёт для минимального набора позиций (комбо 1+3+5 по группам или одна доп. 7–10).
5. `POST /api/public/delivery-orders` — создание **одного** тестового заказа (если не отключено).

Ответ создания заказа проверяется на поля, которые использует панель успеха на лендинге: `id`, `deliveryDate`, `customerName`, `totalAmount`, `items[]`, `branch.name`.

## Запуск

Полный ритуал перед релизом (health + KPI + этот smoke + сборка CRM) — **`npm run verify:launch`** из `CRM/crm-mvp`, см. `CRM/crm-mvp/docs/LAUNCH_VERIFY_RUNBOOK.md`.

Из каталога `landing-order`:

```bash
node scripts/public-order-smoke.mjs
```

С другим API:

```bash
node scripts/public-order-smoke.mjs --api-base https://your-host.example/api
```

Только до quote (без создания заказа в CRM):

```bash
node scripts/public-order-smoke.mjs --dry-run
```

Или:

```bash
set POLDEN_SMOKE_SKIP_ORDER=1
node scripts/public-order-smoke.mjs
```

Переменные окружения:

| Переменная | Назначение |
|------------|------------|
| `POLDEN_SMOKE_API_BASE` | База с суффиксом `/api`, например `http://localhost:4000/api` |
| `POLDEN_SMOKE_BRANCH_ID` | Явный id точки (иначе — как на лендинге: «центр» в имени или первая) |
| `POLDEN_SMOKE_SKIP_ORDER=1` | Не вызывать `POST /public/delivery-orders` |
| `POLDEN_SMOKE_ATTRIBUTION=1` | Добавить в тело заказа тестовый объект `attribution` (проверка бэкенда) |

Через npm (если используете `package.json` в этом каталоге):

```bash
npm run smoke:public-order
```

## Безопасность тестового заказа

- Имя: `SMOKE_TEST Полдень`
- Комментарий: `SMOKE_TEST_PUBLIC_ORDER — тест скрипта, можно удалить`
- Телефон: `79000000000` (заглушка)
- Скрипт по умолчанию создаёт **не больше одного** заказа за запуск; для CI предпочтительны `--dry-run` или `POLDEN_SMOKE_SKIP_ORDER=1`.

## Требования

- Node **18+** (нативный `fetch`).
- Запущенный CRM API и заполненное меню на завтра для выбранной точки (иначе шаг menu-day или выбор позиций завершится ошибкой).

## Выход

- Код **0** и строка `PASS` — все шаги ок.
- Код **1** и `FAIL` — явное сообщение об ошибке; предыдущие успешные шаги выводятся для контекста.
