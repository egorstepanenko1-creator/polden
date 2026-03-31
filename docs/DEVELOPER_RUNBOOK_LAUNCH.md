# Runbook разработчика — launch (env, API, БД)

Минимум, чтобы не повторить ошибки «чужой SQLite» и «CRM смотрит не на тот API». Ежедневная последовательность запуска — `LAUNCH_BASELINE_HANDOFF.md`.

## Обязательные файлы

| Каталог | Файл | Назначение |
|---------|------|------------|
| `backend/` | `.env` (не в git) | `DATABASE_URL`, `CRM_INTERNAL_TOKEN`, порт, VK при необходимости |
| `frontend/` | `.env` (не в git) | `VITE_CRM_TOKEN`, опционально `VITE_API_BASE` / `VITE_DEV_API_PROXY_TARGET` |

Шаблоны: `backend/.env.example`, `frontend/.env.example`.

## Локальный frontend → какой API

1. **По умолчанию:** `VITE_API_BASE` пустой → все запросы `fetch` идут на `/api/...` относительно dev-сервера Vite.
2. **Прокси Vite:** `vite.config.js` читает `VITE_DEV_API_PROXY_TARGET` (default `http://localhost:4000`).
3. **Напрямую в прод/stage:** `VITE_API_BASE=https://<host>` (без `/api` в конце) + `VITE_CRM_TOKEN` как на целевом backend.

Не коммитить `.env` с прод-токенами. Не оставлять секреты в файлах вида `.env.txt`.

## Backend — проверка целевой БД

- При старте в логах:  
  `[polden] process.cwd=…`  
  `[polden] DATABASE_URL kind=sqlite resolvedFile=<абсолютный путь>`  
  (для Postgres: `kind=relational`).
- Относительный SQLite в `DATABASE_URL` разрешается от **`backend/prisma/`**, см. `backend/src/databaseEnv.js`.

## Быстрое обнаружение «не той» БД

- Лог: **0 bytes** или **missing file** для SQLite — тревога.
- С `NODE_ENV=production` или `POLDEN_STRICT_DB_CHECK=1`: старт **падает**, если `Branch` пустая, пока не задан `POLDEN_ALLOW_EMPTY_DB=1`.
- `GET /health`: при `POLDEN_HEALTH_DETAIL=1` в ответе `sqliteAbsPath`, `branchCount`.

## Команды проверки (подставить хост и токен)

Одна и та же база `<API>` (origin без `/api`), что видит оператор через прод или через прокси.

```bash
# Живость + БД
curl -sS "<API>/health"

# То же с деталями БД на процессе с POLDEN_HEALTH_DETAIL=1
curl -sS "<API>/health"

# Ветки (публично)
curl -sS "<API>/api/public/branches"

# Меню на дату (как лендинг)
curl -sS "<API>/api/public/menu-day?branchId=<UUID>&date=YYYY-MM-DD"

# Заказы по дате доставки (CRM token) — сверка с UI «Заказы по дате»
curl -sS "<API>/api/delivery-orders?branchId=<UUID>&date=YYYY-MM-DD" \
  -H "X-CRM-Token: <token>"
```

Локальный CRM в dev: консоль браузера при загрузке заказов — `[polden] delivery-orders { branchId, date, count }` (`App.jsx`, только dev). Если `count` здесь ≠ длина ответа curl с теми же query — смотреть `VITE_API_BASE` / прокси.

## Сборка / верификация репо

```bash
cd CRM/crm-mvp/backend && npm ci && node --check src/server.js
cd ../frontend && npm ci && npm run build
cd .. && npm run verify:launch   # см. docs/LAUNCH_VERIFY_RUNBOOK.md
```
