# VK → операторский заказ (текущая фаза)

## Истина до изменений

- VK-бот создаёт только **VkLead** (Callback API → `vkWebhookRoutes.js` / `vkBotHandler.js`).
- Реальные продажи учитываются в **DeliveryOrder** (публичный `POST /api/public/delivery-orders`).
- У заказа не было полей **status** и **sourceChannel**; связи лида с заказом не было.

## Что делает эта фаза

1. **Общий сервис создания заказа** — `backend/src/deliveryOrderService.js`, функция `createDeliveryOrderFromInput`. Сумма только через `computeQuoteKopeks` (`pricing.js`).
2. **Схема БД** — у `DeliveryOrder`: `status` (по умолчанию `NEW`), `sourceChannel` (по умолчанию `SITE`). У `VkLead`: опциональный `convertedOrderId` → FK на `DeliveryOrder` (один лид — один связанный заказ).
3. **Публичный заказ** — по-прежнему `POST /api/public/delivery-orders`, внутри вызывает тот же сервис (`status=NEW`, `sourceChannel=SITE`).
4. **CRM** — `POST /api/delivery-orders/manual` (токен `X-CRM-Token`), опционально `vkLeadId` для конверсии лида; `PATCH /api/delivery-orders/:id/status` — смена статуса с простыми правилами переходов.
5. **UI** — форма «Новый заказ» на экране «Заказы и KPI»; из «Лиды VK» — «Создать заказ в CRM» с предзаполнением полей и **без автоматического состава позиций** (оператор выбирает qty по слотам меню на дату).

## Как лид VK становится заказом

1. Оператор открывает лид → **Создать заказ в CRM**.
2. Открывается модальная форма: имя, телефон, адрес, комментарий; дата доставки — из распознанного текста лида (`DD.MM.YYYY` / `YYYY-MM-DD`) или вручную; если текст даты не распознан, показывается предупреждение с исходной строкой.
3. Оператор выбирает филиал, дату, **количества по позициям 1–10** (загружается меню на дату из API).
4. Отправка → `POST /api/delivery-orders/manual` с `vkLeadId` и `sourceChannel: VK` (на сервере для лида принудительно `VK`). Создаётся `DeliveryOrder`, у лида проставляются `convertedOrderId` и `status = CONVERTED`.

## Что остаётся ручным

- Выбор позиций и количеств (в лиде нет структурированных `items`).
- Распознавание свободного текста даты — только простые форматы; иначе оператор вводит дату сам.
- Смена статусов заказа после создания — через UI или `PATCH`.

## Почему бот не создаёт заказ автоматически

В VkLead нет достоверного состава заказа в терминах `MenuDayItem` / позиций 1–10. Автогенерация позиций дала бы **фиктивный** заказ и неверную выручку. Канал VK на этой фиксации остаётся **лидогенерацией**; подтверждение меню и суммы — зона оператора и того же pricing, что и сайт.

## Маршруты

| Метод | Путь | Авторизация |
|--------|------|-------------|
| POST | `/api/public/delivery-orders` | нет |
| POST | `/api/delivery-orders/manual` | `X-CRM-Token` |
| PATCH | `/api/delivery-orders/:id/status` | `X-CRM-Token` |
| GET | `/api/delivery-orders` | `X-CRM-Token` (как раньше; ответ расширен полями `status`, `sourceChannel`, `vkLeadId`) |

Эндпоинт `POST /api/vk-leads/:id/convert` в API сохранён для совместимости; в новом UI предпочтительны форма заказа и копирование текста без смены статуса «в пустоту».

## Схема (кратко)

- `DeliveryOrder.status`: `NEW` | `CONFIRMED` | `KITCHEN` | `DELIVERING` | `DONE` | `CANCELED`
- `DeliveryOrder.sourceChannel`: `SITE` | `VK` | `MANUAL` | `PHONE`
- `VkLead.convertedOrderId` — nullable, unique, `ON DELETE SET NULL` на заказ

Миграция: `20260331182122_delivery_order_status_vk_convert` (в среде разработки могут быть сопутствующие пересоздания таблиц Prisma для SQLite — применять на проде через `prisma migrate deploy` и резервную копию).

## Краткий сценарий оператора

1. Лиды VK → открыть лид → **Создать заказ в CRM** → заполнить позиции → создать.  
2. Или «Заказы и KPI» → **Новый заказ** → канал MANUAL/PHONE/VK (без лида).  
3. В списке заказов видны статус и канал; в детали — смена статуса по разрешённым переходам.
