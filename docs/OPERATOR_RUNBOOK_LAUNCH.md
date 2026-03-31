# Runbook оператора — launch (заказы + меню)

**Единая последовательность дня, строгий чеклист и таблица сбоев** — только в `LAUNCH_BASELINE_HANDOFF.md` (§ «Ежедневный контур запуска», «Строгий ежедневный чеклист», «Таблица сбоев»). Здесь — значения на смену, команды и привязка к экранам.

## На смену записать (2 значения)

| Поле | Откуда взять |
|------|----------------|
| **`branchId`** | `GET <API>/api/public/branches` → нужная точка → поле `id` (тот же id, что в CRM в селекте точки). |
| **`date`** | Календарное завтра в **одном** часовом поясе с клиентами; `YYYY-MM-DD`; совпадает с CRM «Меню на день» и полем «Дата доставки» на заказах. |

`<API>` — origin backend **без** суффикса `/api` (как в curl ниже: `<API>/health`, `<API>/api/...`).

---

## Где что в CRM

| Шаг baseline | Экран | Файл-якорь |
|--------------|--------|------------|
| Меню | «Меню на день» | `frontend/src/MenuDayEditorPage.jsx` |
| Заказы | «Заказы и KPI» | `frontend/src/App.jsx` (`fetchDeliveryOrders`) |
| Ветки в UI | загрузка точек | `frontend/src/App.jsx` (`fetchBranches`) |

---

## Публичное меню (curl)

```bash
curl -sS "<API>/api/public/menu-day?branchId=<branchId>&date=<date>"
```

Ожидание: `ok: true`, в `data.items` непустые `name` там, где продаём.

---

## Сайт (визуально)

Открыть публичный лендинг заказа: **нет** баннера про неподтверждённое меню; живое меню (`menuLoadStatus === 'live'`, `landing-order/index.html`).

---

## Повторяемое доказательство контура (curl, без UI)

Подставьте `<API>`, `<TOKEN>` (= `CRM_INTERNAL_TOKEN` целевого API), **`branchId`**, **`date`**:

```bash
curl -sS "<API>/health"
curl -sS "<API>/api/public/branches"
curl -sS "<API>/api/public/menu-day?branchId=<branchId>&date=<date>"
curl -sS "<API>/api/delivery-orders?branchId=<branchId>&date=<date>" -H "X-CRM-Token: <TOKEN>"
```

Ожидание: health ok; branches непустой; menu-day с именами; delivery-orders — массив (может быть пустым до продаж).

---

## Один живой заказ (smoke)

Если политика позволяет: лендинг → позиция → имя/телефон → отправить; в CRM те же **`branchId`** и **`date`** — новый `id`. Иначе: `landing-order/SMOKE_PUBLIC_ORDER.md`, `npm run verify:launch` (`docs/LAUNCH_VERIFY_RUNBOOK.md`).

---

## Если что-то не так

Открыть **`LAUNCH_BASELINE_HANDOFF.md` → «Таблица сбоев»** и выполнить **первое действие** по строке симптома.
