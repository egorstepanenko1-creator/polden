# Daily Ops Analytics v1

Компактная операционная сводка для CRM Polden: один день доставки, один филиал, без отдельной витрины данных и без BI.

## Маршрут

`GET /api/analytics/daily-ops`

- **Защита:** заголовок `X-CRM-Token` (как у остальных CRM-эндпоинтов).
- **Параметры query:**
  - `branchId` — обязателен.
  - `date` — дата доставки `YYYY-MM-DD`. Если не передана, подставляется календарный «сегодня» по **локальному времени сервера**.
  - `compareDate` — опционально вторая дата доставки для простого сравнения (соседний операционный день: сегодня ↔ завтра).

## Источник данных

Все агрегаты считаются по модели **DeliveryOrder** с фильтром `branchId` + `deliveryDate = date`. Отдельные таблицы аналитики не используются.

Поля:

- `status`: `NEW` | `CONFIRMED` | `KITCHEN` | `DELIVERING` | `DONE` | `CANCELED`
- `sourceChannel`: `SITE` | `VK` | `MANUAL` | `PHONE`
- `totalAmount` — выручка заказа в **копейках**

## Формат ответа

Обёртка стандартная: `{ ok: true, data: { ... } }`.

### Без `compareDate`

```json
{
  "primary": { "...": "см. ниже" },
  "compare": null,
  "deltas": null
}
```

### С `compareDate`

```json
{
  "primary": { "...": "выбранная дата" },
  "compare": { "...": "compareDate" },
  "deltas": {
    "totalOrders": 0,
    "totalRevenueKopeks": 0,
    "averageOrderValueKopeks": 0,
    "bySource": { "SITE": 0, "VK": 0, "MANUAL": 0, "PHONE": 0 }
  }
}
```

Дельты: **primary − compare** (положительное значение — на выбранной дате больше, чем на сравниваемой).

### Объект `primary` / `compare`

| Поле | Смысл |
|------|--------|
| `branchId`, `deliveryDate` | Контекст |
| `totalOrders` | Число заказов на дату доставки |
| `totalRevenueKopeks` | Сумма `totalAmount` по всем заказам |
| `averageOrderValueKopeks` | `totalRevenueKopeks / totalOrders` (0 если заказов нет) |
| `bySource` | Счётчики заказов по каналу |
| `byStatus` | Счётчики по статусу |
| `newOrdersCount` | `byStatus.NEW` |
| `confirmedOrdersCount` | `byStatus.CONFIRMED` |
| `inProgressCount` | `KITCHEN + DELIVERING` |
| `doneOrdersCount` | `byStatus.DONE` |
| `canceledOrdersCount` | `byStatus.CANCELED` |
| `topPositions` | До 10 слотов меню (`position` 1–10): суммарное `qty` по `DeliveryOrderItem` |
| `latestOrders` | До 10 последних по `createdAt`: id, createdAt, customerName, status, sourceChannel, totalAmount |
| `attention` | Массив срабатываний правил (см. ниже) |

Некорректные/пустые `status` и `sourceChannel` в данных приводятся к `NEW` и `SITE` при подсчёте (защита от мусора в БД).

## Правила «Внимание»

Константы порогов экспортируются из `backend/src/dailyOpsAnalytics.js` как `DAILY_OPS_ATTENTION_THRESHOLDS`.

| Код | Условие (упрощённо) |
|-----|---------------------|
| `ZERO_ORDERS` | `totalOrders === 0` |
| `MANY_NEW` | `new ≥ 8` **или** (`total ≥ 5` и доля NEW ≥ 45%) |
| `HIGH_CANCELED_SHARE` | `total ≥ 4` и доля CANCELED ≥ 25% |
| `MANY_IN_KITCHEN` | `kitchen ≥ 10` **или** (`total ≥ 5` и доля KITCHEN ≥ 35%) |
| `LOW_DONE_SHARE` | `total ≥ 5`, `NEW+CONFIRMED ≥ 6`, доля DONE ≤ 15% |
| `NO_DONE_IN_PIPELINE` | `total ≥ 5`, `DONE === 0`, `KITCHEN+DELIVERING ≥ 2` |

У каждого элемента: `code`, `severity` (`info` | `warn`), `message` (человекочитаемо на русском).

## Производительность

На каждую запрошенную дату выполняется один `findMany` по `DeliveryOrder` с `include.items` (только `position`, `qty`). Агрегация в памяти. Для двух дат — два запроса через `Promise.all`.

## CRM (фронт)

На экране «Заказы / KPI» над блоком `OperatorDeliveryWorkspace` отображается **`DailyOpsPanel`**:

- карточки: заказы, выручка, средний чек;
- полосы по каналам и статусам;
- блок «Внимание»;
- топ позиций и короткий список последних заказов.

Если выбранная дата — **сегодня** или **завтра** (локально у браузера), в API автоматически передаётся `compareDate` (другой из пары), показываются дельты.

Старый блок KPI остаётся в `<details>` ниже.

## Ограничения

- Сравнение только между двумя явно заданными датами; для произвольной даты без пары «сегодня/завтра» дельты не запрашиваются.
- Дефолт `date` на сервере завязан на часовой пояс процесса Node — при расхождении с браузером лучше всегда передавать `date` с клиента.
- Топ позиций — по номеру слота меню (1–10), без названий блюд (имена в `MenuDayItem` не подтягиваются в этом API).
- Нет экспорта, ролей, исторических трендов и внешних вендоров аналитики.
