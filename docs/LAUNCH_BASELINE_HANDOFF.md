# Launch baseline — передача (зафиксировано после живого E2E заказа)

Краткий срез **рабочего контура**: публичный заказ → backend → CRM. Без новых фич; детали операций — `OPERATOR_RUNBOOK_LAUNCH.md`, для разработки — `DEVELOPER_RUNBOOK_LAUNCH.md`.

## Подтверждённо работает

- Публичный лендинг `landing-order/` → API `POST /api/public/delivery-orders` и quote/menu/branches.
- Заказы в CRM: раздел «Заказы по дате доставки», фильтр **точка + дата доставки** (`GET /api/delivery-orders`).
- VK-лиды и readiness — без изменений в этой фиксации (не ломать при деплое).

## Критические переменные окружения

| Область | Переменные | Зачем |
|--------|------------|--------|
| Backend | `DATABASE_URL` | Источник БД. SQLite `file:./…` **относится к каталогу `backend/prisma/`**, не к `cwd`. Для прода предпочтительно **абсолютный** `file:/…`. |
| Backend | `CRM_INTERNAL_TOKEN` | Заголовок `X-CRM-Token` для защищённых `/api/*`. |
| Backend | `NODE_ENV` / `POLDEN_STRICT_DB_CHECK` / `POLDEN_ALLOW_EMPTY_DB` | Строгий старт: не поднимать прод с пустой таблицей `Branch` без явного override. |
| Backend | `POLDEN_HEALTH_DETAIL=1` | Расширенный `GET /health` (путь SQLite, `branchCount`). |
| Frontend dev | `VITE_CRM_TOKEN` | Должен совпадать с `CRM_INTERNAL_TOKEN` целевого API. |
| Frontend dev | `VITE_API_BASE` | Пусто → запросы на `/api` (прокси Vite). Задано → прямой origin API (прод). |
| Frontend dev | `VITE_DEV_API_PROXY_TARGET` | Куда Vite проксирует `/api`, если `VITE_API_BASE` пустой (по умолчанию `http://localhost:4000`). |

Полные шаблоны: `backend/.env.example`, `frontend/.env.example`.

## Production backend — источник истины

- Один процесс Node из **`CRM/crm-mvp/backend`**, один активный **`DATABASE_URL`** в `EnvironmentFile`/`.env` сервиса.
- После переноса каталога или смены `WorkingDirectory` перепроверить логи старта: строка `[polden] DATABASE_URL kind=sqlite resolvedFile=…` и **`process.cwd`**.

## Локальный CRM к прод-API намеренно

1. `frontend/.env`: `VITE_API_BASE=https://<prod-api-origin>` (без `/api` в конце), `VITE_CRM_TOKEN=<как на проде>`.
2. `npm run dev` — запросы идут на прод (нужен доступ к API; на backend включён широкий CORS).

Альтернатива без `VITE_API_BASE`: только прокси — `VITE_DEV_API_PROXY_TARGET=https://<prod-api-origin>`.

## Ежедневный контур запуска (одна последовательность)

Исполнять **строго по номерам**. Команды и подсказки по экранам — `docs/OPERATOR_RUNBOOK_LAUNCH.md`.

**Перед шагом 1** записать на смену **`branchId`** и **`date`** (`YYYY-MM-DD`, календарное **завтра** для клиентов, **один часовой пояс** для лендинга и CRM). Дальше везде только эта пара.

1. **Ветки (branch check)** — `GET <API>/health` → `ok`, `dbConnected: true`. Затем `GET <API>/api/public/branches` → массив не пустой; **`branchId`** = `id` нужной точки. В CRM в селекте точки — тот же id. Лендинг по умолчанию: имя с «центр» или первая ветка (`landing-order/index.html` `init`) — сверить с ответом API.
2. **Дата «завтра» (date check)** — одна **`date`** на меню CRM, `menu-day`, лендинг и фильтр заказов. Источник «завтра» в коде: `frontend/src/dates.js` (`localTomorrowISO`), `landing-order/index.html` (`getTomorrowISO`).
3. **Меню в CRM** — «Меню на день»: точка = **`branchId`**, дата = **`date`**; слоты 1–10: название и цена где продаём; сохранить (`MenuDayEditorPage.jsx` → `PUT /api/menu-day-items/upsert`).
4. **Публичный API `menu-day`** — `GET <API>/api/public/menu-day?branchId=<branchId>&date=<date>` → `ok: true`, в `data.items` непустые `name` для нужных позиций (публичный маршрут в `backend/src/server.js`).
5. **Разблокировка лендинга** — публичный сайт заказа: **нет** баннера про неподтверждённое меню; отображается живое меню (`menuLoadStatus === 'live'` в `landing-order/index.html`).
6. **Заказы в CRM по дате** — «Заказы и KPI»: точка = **`branchId`**, **дата доставки** = **`date`**; «Обновить» (`App.jsx` → `GET /api/delivery-orders`).
7. **Повторяемое доказательство** — три curl в `docs/OPERATOR_RUNBOOK_LAUNCH.md` § «Повторяемое доказательство контура»; при политике — один тестовый заказ с лендинга или `npm run verify:launch` из `CRM/crm-mvp` (`docs/LAUNCH_VERIFY_RUNBOOK.md`).

Детали БД на старте: `POLDEN_HEALTH_DETAIL=1`, `backend/src/databaseEnv.js`, `backend/src/server.js`.

## Строгий ежедневный чеклист

Не переходить к следующему пункту, пока текущий не закрыт.

- [ ] Записаны **`branchId`** и **`date`** на смену.
- [ ] **1** Health ok, branches непустой, в CRM выбран этот **`branchId`**.
- [ ] **2** **`date`** согласована (одно «завтра», один TZ).
- [ ] **3** Меню на день сохранено для (**`branchId`**, **`date`**).
- [ ] **4** Ответ `menu-day` с нужными непустыми `name`.
- [ ] **5** Лендинг без блокирующего баннера, меню в режиме live.
- [ ] **6** CRM: заказы по (**`branchId`**, **`date`**) обновлены.
- [ ] **7** Curl-цепочка; при необходимости — живой заказ или `verify:launch`.

## Таблица сбоев (первые действия)

| Сигнал | Первое действие |
|--------|------------------|
| `/health` не ok / нет ответа | Верный `<API>` и порт; процесс backend запущен; не перепутать прод и stage. |
| `branches` пустой | Чужая/пустая БД или неверный хост; лог `[polden] DATABASE_URL … resolvedFile`; при `POLDEN_HEALTH_DETAIL=1` — `branchCount`. |
| Точка на сайте ≠ точка в CRM | Выставить в CRM **`branchId`** со смены; сверить с `GET /api/public/branches` и логикой `init` на лендинге. |
| Разные даты (CRM / curl / сайт) | Остановиться: одна **`date`** на весь контур; пересчитать «завтра» в одном TZ. |
| Меню в CRM есть, `menu-day` пустой | Другая **точка** или **дата** в CRM vs curl; перепроверить (**`branchId`**, **`date`**). |
| Сайт: меню не подтверждено / не live | Сверить **`branchId`**, **`date`**; повторить шаги 3–4; curl `menu-day`. |
| CRM: нет заказов на дату | Поле **дата доставки** = **`date`**; та же **точка**; локально: `VITE_API_BASE` / `VITE_DEV_API_PROXY_TARGET` + `VITE_CRM_TOKEN` = целевой API (`DEVELOPER_RUNBOOK_LAUNCH.md`). |
| CRM: 401 / ошибка токена | `VITE_CRM_TOKEN` = `CRM_INTERNAL_TOKEN` того же API. |
| Ответ `delivery-orders` не массив | Сообщение в CRM; в dev — debug в консоли (`App.jsx`). |
| Backend не стартует (strict) | Пустая `Branch`; seed/миграции или осознанно `POLDEN_ALLOW_EMPTY_DB=1`. |

## Что сейчас не трогать без нужды

- Контракты публичного заказа (`pricing.js`, `POST /api/public/delivery-orders`).
- Логику разблокировки заказа на лендинге (`landing-order/index.html`, `menuLoadStatus` / `confirmed`).
- Prisma-схему заказов/меню без миграции и согласования.

## Связанные документы

- `docs/OPERATOR_RUNBOOK_LAUNCH.md` — `<API>`, curl, smoke, детали экранов (дублировать чеклист/таблицу сбоев не нужно).
- `docs/DEVELOPER_RUNBOOK_LAUNCH.md` — env, прокси, проверка БД/API.
- `docs/LAUNCH_VERIFY_RUNBOOK.md` — `npm run verify:launch`.
