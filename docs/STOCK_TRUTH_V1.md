# Stock truth v1 (movement journal)

**Model:** `StockMovement` — единственный источник правды; остаток = сумма знаковых движений по филиалу.

**Типы:** `OPENING_BALANCE`, `RECEIPT`, `ADJUSTMENT_IN` → **+**; `ADJUSTMENT_OUT`, `WASTE` → **−**. В payload поле `quantity` всегда **положительное** (величина).

**API (CRM token):**

- `GET /api/stock/balances?branchId=`
- `GET /api/stock/movements?branchId=` + опционально `ingredientId`, `dateFrom`, `dateTo` (фильтр по `occurredAt`)
- `POST /api/stock/movements` — JSON: `branchId`, `ingredientId`, `unitId` (= `ingredient.defaultUnitId`), `movementType`, `quantity` (>0), `occurredAt`, `note?`

**Проверка без HTTP:** `cd backend && npm run prove:stock-foundation`

**CRM UI:** вкладка **Stock Desk** во фронте (`VITE_CRM_TOKEN`) — остатки, история, создание движения.
