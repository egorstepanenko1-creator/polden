# Чеклист перед живым запуском (14-дневный коммерческий спринт)

Контекст: рынок **Чебаркул**, цель — **стабилизация и реальные данные**, без расширения продукта.  
Связанные документы: `SALES_SPRINT_VERIFICATION_RUNBOOK.md`, `PUBLIC_ORDER_HARDENING.md`, `LANDING_LAUNCH_SHELL_V1.md`, `LAUNCH_VERIFY_RUNBOOK.md`.

---

## 1. Что настроить до боевого использования

| Область | Действие |
|---------|----------|
| **БД** | Задать `DATABASE_URL` (SQLite `file:…` или другой провайдер по схеме Prisma). На пустой БД без филиалов: первый старт с `POLDEN_ALLOW_EMPTY_DB=1` или выполнить seed/migrate до появления `Branch`. |
| **Миграции** | В каталоге `backend`: `npx prisma migrate deploy` на целевой БД. |
| **Prisma Client** | После миграций: `npx prisma generate`. |
| **CRM-токен** | В production-like (`NODE_ENV=production` или `POLDEN_PRODUCTION_LIKE=1`): задать **сильный** `CRM_INTERNAL_TOKEN`; нельзя оставлять `dev` без `POLDEN_ALLOW_DEV_CRM_TOKEN=1`. |
| **CORS** | В production-like обязателен хотя бы один из: `POLDEN_CORS_ORIGINS`, `PUBLIC_SITE_ORIGIN`, `CRM_FRONTEND_ORIGIN`, `CRM_FRONTEND_ORIGINS` (см. `corsConfig.js`, `configStartup.js`). |
| **Публичный сайт в CRM** | `PUBLIC_SITE_ORIGIN` = реальный `https://…` лендинга (иначе ссылки контент-пайплайна уйдут на заглушку `example.invalid`). |
| **VK Callback** | `VK_WEBHOOK_SECRET`, `VK_CALLBACK_CONFIRMATION_CODE`; для исходящих сообщений бота — `VK_GROUP_ACCESS_TOKEN`. В production-like пустой secret запрещён без `POLDEN_ALLOW_EMPTY_VK_WEBHOOK_SECRET=1`. |
| **Прокси** | За nginx/reverse proxy: при необходимости `POLDEN_TRUST_PROXY=1` для корректного rate limit по IP. |
| **Меню на «завтра»** | В CRM заполнить **меню дня** для филиала Чебаркула на дату, на которую лендинг считает «завтра» — иначе B2C-форма останется заблокированной (`menuLoadStatus !== live`). |
| **Фронт CRM** | Сборка с `VITE_API_BASE` (URL API до `/api` или пусто + proxy) и `VITE_CRM_TOKEN` = тому же значению, что `CRM_INTERNAL_TOKEN` на бэкенде. |

---

## 2. Плейсхолдеры, требующие человеческого ввода

Проверено по авторитетному коду (`landing-order/index.html`, `backend/.env.example`, CRM).

| Где | Что заполнить |
|-----|----------------|
| **Лендинг `POLDEN_LAUNCH_BRIDGE`** | `vkGroupUrl` — URL сообщества VK. `supportLineHtml` — согласованная HTML-строка (например ссылка `tel:`). См. `LANDING_LAUNCH_SHELL_V1.md`. |
| **Лендинг, текст VK** | Пока `vkGroupUrl` пуст: показывается текст «ссылку публикуем при запуске…». |
| **Лендинг, подвал** | Строка «ИП/ООО, ОГРН/ИНН, оферта — вставить перед публичным запуском». |
| **Лендинг, bridge-footnote** | «Юридические реквизиты и политика… — добавьте в подвал». |
| **Лендинг, карточка поддержки** | Текст про «настройку в коде страницы» до заполнения `supportLineHtml`. |
| **Backend `.env.example`** | `PUBLIC_SITE_ORIGIN=https://example.com` — заменить на **боевой** домен. |
| **VK (опционально)** | `VK_OPERATOR_CONTACT_TEXT` — текст подсказки «связаться с оператором» в боте. |
| **Юридическое** | Оферта, политика ПДн, реквизиты — вне кода; в подвал лендинга вручную. |

Переменные **без** «заглушки в UI», но **обязательные для работы контура**:

- `CRM_INTERNAL_TOKEN` / `VITE_CRM_TOKEN`
- `DATABASE_URL`
- Для прода: CORS origins + `VK_*` по таблице выше

---

## 3. Порядок команд (локально / первый подъём)

Выполнять из **корня репозитория** или указанных каталогов.

### Backend (`project/CRM/crm-mvp/backend`)

1. `npm install` (или `npm ci` при lockfile)
2. Скопировать `.env` из `.env.example`, заполнить секреты и URL
3. `npx prisma migrate deploy`
4. `npx prisma generate`
5. При пустой БД: `npm run db:seed` (или иной принятый способ создания `Branch` и данных)
6. `npm run start` (или `node src/server.js`)

### Frontend CRM (`project/CRM/crm-mvp/frontend`)

1. `npm install`
2. `.env` / `.env.local`: `VITE_CRM_TOKEN`, при необходимости `VITE_API_BASE` и `VITE_DEV_API_PROXY_TARGET` (dev)
3. `npm run build` — артефакты в `dist/`; раздать через nginx / хостинг статики

### Лендинг (`project/landing-order`)

- Статический `index.html`: открыть с **корректным API** — query `?api=https://host/api` или `localStorage polden_api_base`, иначе по умолчанию `http://localhost:4000/api`
- Перед продом: заполнить `POLDEN_LAUNCH_BRIDGE` и подвал в `index.html` (или процесс сборки с подстановкой — вне scope текущего репо)

### Мета-команда проверки (из `project/CRM/crm-mvp`)

- `npm run verify:launch` — smoke без создания заказа  
- `npm run verify:launch:full` — полный smoke с одним тестовым заказом  

---

## 4. Prisma на Windows

- **`npx prisma generate`**: при ошибке `EPERM` / `rename … query_engine-…dll` закройте процессы, держащие файлы в `node_modules/.prisma` (Node, IDE, антивирус на время generate), повторите команду.
- Путь **`file:./dev.db`** в `DATABASE_URL` разрешается **относительно каталога `prisma/`**, не от cwd сервера — на проде предпочтительно абсолютный путь в `file:/…`.

---

## 5. Краткий аудит «что сломает прод»

| Симптом | Причина |
|---------|---------|
| Процесс не стартует | `validateProductionLikeConfig`: нет токена / CORS / VK secret |
| CRM 401 | Несовпадение `X-CRM-Token` и `CRM_INTERNAL_TOKEN` |
| Браузер: CORS error | Origin фронта/лендинга не в списке разрешённых |
| Лендинг: заказ недоступен | Нет подтверждённого `menu-day` на завтра для выбранного филиала |
| VK webhook 403/ошибка | Неверный `VK_WEBHOOK_SECRET` или код подтверждения |
| Ссылки в CRM «example.invalid» | Не задан или невалиден `PUBLIC_SITE_ORIGIN` |

---

## 6. Рынок Чебаркул

- В БД имя филиала с подстрокой **«Чебаркул»** теперь выбирается лендингом **раньше**, чем совпадение с «центр» (см. `init()` в `landing-order/index.html`). Убедитесь, что в `Branch.name` это отражено.
