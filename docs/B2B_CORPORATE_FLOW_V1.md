# B2B / корпоративные обеды v1

Практичный слой для заявок «офис / команда / одна точка доставки» поверх существующих `DeliveryOrder`. Без биллинга, договоров и франшизы.

## Схема БД (Prisma)

Добавлены модели:

| Модель | Назначение |
|--------|------------|
| **CompanyAccount** | Карточка компании: название, город, адрес, заметки, статус, опционально `defaultBranchId` (типовая точка). |
| **CompanyContact** | Контакты компании: имя, телефон, опционально должность и предпочтительный канал связи. |
| **CorporateLead** | Заявка (лид): контакт, компания, адрес, оценка численности, время, комментарий, канал, статус, опциональная связь `companyAccountId`. |

В **DeliveryOrder** добавлено опциональное поле **`companyAccountId`** — связь с компанией для повторных B2B-заказов (прослеживаемость).

Миграция: `20260331200000_b2b_corporate_flow_v1`.

## Публичная точка входа

- **Лендинг** `project/landing-order/index.html`: секция «Обед в офис» (`#b2b-corporate`), ссылка в шапке.
- **POST** ` /api/public/corporate-leads`  
  - Тело JSON: `companyName`, `contactName`, `phone`, `city`, `address`, опционально `headcountEstimate`, `preferredDeliveryTime`, `comment`, пустой **`polden_hp`** (honeypot).  
  - Ограничения: `Content-Type: application/json`, тот же rate limit, что у публичного создания заказа, проверка длин полей (`guardCorporateLeadFieldLengths`).  
  - Создаётся `CorporateLead` с `sourceChannel = SITE`, `status = NEW`.

Текст на лендинге не обещает фиксированных цен и онлайн-оплаты для B2B.

## CRM API (заголовок `X-CRM-Token`)

| Метод | Путь |
|--------|------|
| GET | `/api/company-accounts?status=&q=` |
| POST | `/api/company-accounts` |
| PATCH | `/api/company-accounts/:id` |
| POST | `/api/company-accounts/:id/contacts` |
| GET | `/api/corporate-leads?status=&city=&q=` |
| POST | `/api/corporate-leads` |
| PATCH | `/api/corporate-leads/:id` |
| POST | `/api/corporate-leads/:id/convert-to-company` |

Ответ **GET `/api/corporate-leads`** дополнительно содержит агрегаты **`leadCountsByStatus`** и **`companyCountsByStatus`** (для сводки в разделе B2B без отдельной аналитики).

### Конвертация лида в компанию

**POST** `/api/corporate-leads/:id/convert-to-company`  
Тело: `{ "defaultBranchId": "<id филиала или пусто>" }`.

- Создаётся `CompanyAccount` (статус **ACTIVE**) с данными из лида, заметкой `Создано из лида <id>`.
- Создаётся первый **CompanyContact** из `contactName` / `phone` лида.
- Лид сохраняется: **`companyAccountId`** заполняется, **`status`** → **ACTIVE** (в терминах воронки это «перешли в работу как компания»).

Повторная конвертация того же лида → **409**.

## Статусы

### CorporateLead

`NEW` → `CONTACTED` → `QUOTED` → `PILOT` → `ACTIVE` | `LOST`

- **ACTIVE** также используется после успешной конвертации (лид привязан к компании).

### CompanyAccount

`NEW`, `ACTIVE`, `PAUSED`, `LOST`

## Рабочее место в CRM

Раздел **«B2B · корп. обеды»** (`B2BWorkspacePage.jsx`): вкладки заявок и компаний, фильтр по статусу, поиск (от 2 символов), сводные счётчики по статусам, формы «новая заявка» / «новая компания», у лида без компании — действие **«В компанию»** (выбор филиала по умолчанию и конвертация).

## Повторный заказ (реальный DeliveryOrder)

У карточки компании кнопка **«Быстрый заказ»** открывает существующее модальное окно быстрого заказа с предзаполнением:

- имя / телефон / адрес из компании и первого контакта;
- комментарий с пометкой B2B и id компании;
- канал по умолчанию **PHONE**;
- филиал — `defaultBranchId` компании, если задан и существует в списке;
- в запрос **POST `/api/delivery-orders/manual`** передаётся **`companyAccountId`**.

Состав заказа и сумма по-прежнему задаются оператором по меню (как для обычного ручного заказа); численность команды **не** размножает позиции автоматически.

## Ограничения v1

- Нет счетов, договоров, юрлица/ИНН в схеме.
- Нет подписок и авто-расписаний.
- Нет отдельного кабинета клиента.
- В SQLite миграции не добавлен явный FK с `DeliveryOrder.companyAccountId` на `CompanyAccount` (связь обеспечивается Prisma/приложением).
- Поиск по подстроке в SQLite чувствителен к регистру.

## Совместимость

- Публичный B2C **POST `/api/public/delivery-orders`** и логика VK не изменялись по контракту; добавлен отдельный публичный POST для лидов.
- Операторский поток заказов сохранён; к ручному заказу добавлено опциональное поле **`companyAccountId`**.
