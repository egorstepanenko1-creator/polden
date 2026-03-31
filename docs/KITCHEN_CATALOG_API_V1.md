# Kitchen Catalog API v1 (protected)

**Base URL:** same backend as CRM. **Auth:** header `X-CRM-Token` (same as `CRM_INTERNAL_TOKEN`, default `dev` in local).

**Namespace:** `/api/kitchen/*`

**Responses:** `{ ok: true, data: ... }` or `{ ok: false, error: { message, code } }`.

Companion: `KITCHEN_ECONOMICS_IMPLEMENTATION.md`, `foodCost.js` (v1 rule: line `unitId` must equal ingredient `defaultUnitId`).

---

## Happy path (catalog → menu day)

1. **Unit** — `POST /api/kitchen/units` `{ "code": "kg", "displayName": "Килограмм" }`
2. **Ingredient** — `POST /api/kitchen/ingredients` `{ "name": "Рис", "defaultUnitId": "<unitId>" }`
3. **Price** — `POST /api/kitchen/ingredients/<ingredientId>/prices`  
   `{ "unitId": "<same as defaultUnitId>", "pricePerUnitKopeks": 5000, "effectiveFrom": "2020-01-01T00:00:00.000Z", "effectiveTo": null }`
4. **Dish** — `POST /api/kitchen/dishes` `{ "name": "Плов" }`
5. **Draft version** — `POST /api/kitchen/dishes/<dishId>/versions` `{}`
6. **Composition** — `PUT /api/kitchen/dish-versions/<versionId>/ingredients`  
   `{ "lines": [ { "ingredientId": "...", "quantity": 0.2, "unitId": "<ingredient defaultUnitId>" } ] }`
7. **Publish** — `POST /api/kitchen/dish-versions/<versionId>/publish` (empty body)  
   Fails with `FOOD_COST_ERROR` if `foodCostKopeks` cannot resolve all lines at `publishedAt`.
8. **Menu day** — `PUT /api/menu-day-items/upsert` with `dishVersionId` (see menu-day economics doc).

---

## Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/kitchen/units` | List units (`code` asc) |
| POST | `/api/kitchen/units` | Create `{ code, displayName }` |
| GET | `/api/kitchen/ingredients` | List ingredients + `defaultUnit` |
| POST | `/api/kitchen/ingredients` | Create `{ name, defaultUnitId, sku?, active? }` |
| PATCH | `/api/kitchen/ingredients/:ingredientId` | Partial update `name`, `sku`, `active`, `defaultUnitId` |
| GET | `/api/kitchen/ingredients/:ingredientId/prices` | List prices for ingredient |
| POST | `/api/kitchen/ingredients/:ingredientId/prices` | Create price row |
| GET | `/api/kitchen/dishes` | List dishes + `versionCount` |
| POST | `/api/kitchen/dishes` | Create `{ name, category?, active? }` |
| GET | `/api/kitchen/dishes/:dishId/versions` | List versions + `lineCount` |
| POST | `/api/kitchen/dishes/:dishId/versions` | Create next draft `{ notes? }` |
| GET | `/api/kitchen/dish-versions/:versionId` | Version + lines |
| PUT | `/api/kitchen/dish-versions/:versionId/ingredients` | Replace all lines (`draft` only) |
| POST | `/api/kitchen/dish-versions/:versionId/publish` | Publish if non-empty + food cost OK |

---

## Validation notes

- **Ingredient price `unitId`:** must equal that ingredient’s `defaultUnitId` (v1; matches `foodCost` expectations).
- **Price intervals:** half-open `[effectiveFrom, effectiveTo)`; `effectiveTo: null` means unbounded. **No overlap** allowed for the same `(ingredientId, unitId)` pair — otherwise `409` `PRICE_OVERLAP`.
- **Dish lines:** `quantity` > 0; `unitId` must equal the line ingredient’s `defaultUnitId`.
- **Replace composition:** only `status === 'draft'` (`KITCHEN_VERSION_NOT_DRAFT`).
- **Publish:** must be `draft`; not empty; `foodCostKopeks(prisma, versionId, at)` with `at = new Date()` at request time; then `status → published`. Already published → `KITCHEN_ALREADY_PUBLISHED`.

---

## CRM frontend (Kitchen Lab)

В `crm-mvp/frontend` вкладка **Kitchen Lab** в шапке вызывает те же маршруты через прокси Vite (`/api` → backend). Токен: `VITE_CRM_TOKEN` (как для заказов).

## Local checks

```bash
cd backend
node scripts/prove-kitchen-catalog.mjs
```

With API running (optional E2E):

```bash
set API_URL=http://localhost:4000
set CRM_INTERNAL_TOKEN=dev
node scripts/prove-kitchen-catalog.mjs --http
```
