# Правда по точке (Чебаркуль) и порядок после неё / четверг

## Код и данные: откуда берётся имя точки

| Потребитель | Путь в коде | Источник |
|-------------|-------------|----------|
| Публичный API, лендинг, CRM (список точек в селекте) | `GET /api/public/branches` → `prisma.branch.findMany({ orderBy: { name: 'asc' } })` | `backend/src/server.js` |
| Фронт CRM `fetchBranches()` | `GET /api/public/branches` | `frontend/src/api.js` |
| VK меню/заказ | `loadBranchesAndVkForced` → тот же `findMany` + env `POLDEN_VK_DEFAULT_BRANCH_ID` / `POLDEN_VK_ORDER_PROBE_BRANCH_ID` | `backend/src/vkBranchResolve.js` |
| Публичное меню на день | `GET /api/public/menu-day?branchId=&date=` → `MenuDayItem` по `branchId` | `backend/src/server.js` |

**Вывод:** исправление «не той витрины» — в первую очередь **данные** (`Branch.name` и при необходимости фиксация **id** в env). Отдельного CRM-экрана «редактировать Branch» в репозитории нет; есть защищённый сценарий переименования через API (см. ниже).

## Безопаснее: rename или create?

При **одной** операционной точке, которая физически в Чебаркуле, но в БД названа «Новосибирск · Центр»:

- **Переименовать существующую `Branch`** (сохранить тот же `id`) — **безопаснее**: все уже привязанные `MenuDayItem`, `DeliveryOrder`, `VkConversationState.draftBranchId`, B2B `defaultBranchId` и т.д. остаются валидными.
- **Создать вторую `Branch`** «Чебаркуль» без миграции — риск двух точек, дублирования меню и путаницы в VK при отсутствии env; старые заказы останутся на старом `branchId`.

**Create** имеет смысл только если в продукте **две** реальные точки или старая запись не та сущность — это нужно явно подтвердить бизнесом; по умолчанию — **rename**.

## API переименования (уже в коде)

`POST /api/admin/rename-branch-novosibirsk-to-chebarkul` с заголовком `X-CRM-Token` — обновляет все `Branch`, у которых в `name` есть подстрока «Новосибирск», на «Чебаркуль» (или `newName` в теле). Не трогает склад и VK-код.

## Резервная копия (production)

1. Скопировать файл SQLite **или** сделать дамп БД (как принято у вас на хосте) **до** любого `UPDATE`.
2. Зафиксировать текущий `Branch.id` и `name`:  
   `GET https://<API>/api/public/branches`

## Шаги на production (рекомендуемый порядок)

1. **Проверка:** `GET /api/public/branches` — сколько записей, точный `id`, `name`.
2. **Одна точка, неверное имя:**  
   - либо `POST .../rename-branch-novosibirsk-to-chebarkul` (CRM-токен),  
   - либо одноразовый `UPDATE Branch SET name = '…' WHERE id = '…'` вручную под контролем DBA.
3. **Повторная проверка:** `GET /api/public/branches` — ожидаемое имя (например «Чебаркуль») и **тот же** `id`.
4. **Env бэкенда** (перезапуск процесса после правки `.env`):  
   `POLDEN_VK_DEFAULT_BRANCH_ID=<тот же id>`  
   `POLDEN_VK_ORDER_PROBE_BRANCH_ID=<тот же id>`  
   (достаточно одного из них, если одна точка; при нескольких — id именно Чебаркуля.)
5. **Readiness:** `GET /api/vk-bot/readiness` с `X-CRM-Token` — `vkCrmMenu.branchName`, `branchResolution`.

## Четверг (только после п. 1–4)

1. Dry-run сид (проверка ветки и плана):  
   `TARGET_BRANCH_ID=<id после переименования> npm run db:seed:thursday-menu:dry`
2. Запись блюд:  
   `TARGET_BRANCH_ID=<id> npm run db:seed:thursday-menu`
3. CRM → «Меню на день» → выбрать **эту** точку → дата четверга → слоты 1–9, цены, привязка версий рецептов.
4. Проверка: `GET /api/public/menu-day?branchId=<id>&date=<YYYY-MM-DD>` — позиции и названия.

Склад и рассылки VK в этих шагах не меняются.
