# Авторитетные пути и единая правда релиза

Краткий источник правды: **что деплоить и откуда запускать проверки**, без удаления дубликатов в репозитории.

## Авторитетные пути (production / разработка)

| Роль | Путь от корня выгрузки `project/` |
|------|-------------------------------------|
| Backend API | `CRM/crm-mvp/backend` |
| CRM frontend (staff UI) | `CRM/crm-mvp/frontend` |
| Публичный лендинг заказа | `landing-order` |

Полные пути в типичном workspace: `project/CRM/crm-mvp/backend`, `project/CRM/crm-mvp/frontend`, `project/landing-order`.

## Неавторитетные / дубликаты (не деплоить по ошибке)

- **`CRM/crm-mvp/landing-order`** — копия/тень публичного лендинга рядом с CRM; **не** считается источником правды. Правки и релиз — только в **`project/landing-order`**.
- **`project/new/**`** и прочие деревья `new/**` — исторические/вспомогательные копии, **не** релизный контур.
- Документы и отчёты под `Brand/`, `new/new/dlw/` и т.п. могут ссылаться на «`landing-order`» в смысле шаблона пути; **исполняемая правда** — каталог **`project/landing-order`**.

## Скрипты и какие пути используют

| Скрипт | Поведение |
|--------|-----------|
| `CRM/crm-mvp/scripts/verify-launch.mjs` | Smoke: `project/landing-order/scripts/public-order-smoke.mjs` (корень = `project/`, родитель `CRM/crm-mvp`). Переопределение: env **`POLDEN_VERIFY_LANDING_ROOT`** — абсолютный или относительный путь к **корню** авторитетного `landing-order` (каталог с `scripts/`). |
| `landing-order/scripts/public-order-smoke.mjs` | HTTP-проверки API; не привязан к диску, кроме как запускается из авторитетного дерева. |
| `CRM/crm-mvp/package.json` → `verify:launch` | Вызывает `scripts/verify-launch.mjs`. |

## Что нельзя деплоить по ошибке

- Статику из **`CRM/crm-mvp/landing-order`** вместо **`project/landing-order`**.
- Backend или CRM из **`new/**`** вместо **`CRM/crm-mvp/*`**.
- Конфигурацию без обязательных prod-переменных (см. **`PUBLIC_ORDER_HARDENING.md`**, CORS и секреты).

## Связанные документы

- Проверка перед релизом: `LAUNCH_VERIFY_RUNBOOK.md`
- Защита публичного заказа: `PUBLIC_ORDER_HARDENING.md`
