# Kitchen Economics v1 — Backend implementation notes

**Companion to:** `KITCHEN_ECONOMICS_V1_SPEC.md` (normative product rules).

## Schema mapping

| Spec concept | Prisma model / field |
|--------------|----------------------|
| Unit | `Unit` (`code`, `displayName`) |
| Ingredient | `Ingredient` (`defaultUnitId`, `sku`, `active`) |
| Ingredient price (time-bounded) | `IngredientPrice` — `effectiveFrom`, `effectiveTo` (nullable), `pricePerUnitKopeks` |
| Dish | `Dish` |
| Dish version | `DishVersion` (`versionNumber`, `status`: `draft` \| `published`) |
| Recipe line | `DishIngredient` (`quantity` as `Decimal`, `unitId`) |
| Menu-day economics | `MenuDayItem` — `dishVersionId?`, `foodCostKopeksSnapshot?`, `foodCostSnapshottedAt?` |

**Spec deviation (naming only):** spec says `validFrom` / `validTo`; DB uses `effectiveFrom` / `effectiveTo` for clarity with `DateTime` filters.

## Costing module

- **File:** `backend/src/foodCost.js`
- **Exports:** `foodCostKopeks(prisma, dishVersionId, at)`, `foodCostBreakdownKopeks(prisma, dishVersionId, at)`
- **Price selection:** `effectiveFrom <= at` AND (`effectiveTo` IS NULL OR `effectiveTo > at`); choose row with max `effectiveFrom`, tie-break `id` desc.
- **Missing price:** throws `Error` with ingredient and unit ids.
- **v1 unit rule:** `DishIngredient.unitId` must equal `Ingredient.defaultUnitId` (no conversion).

## Kitchen Catalog API (protected)

Minimal CRUD under **`/api/kitchen/*`** (same `X-CRM-Token`): units, ingredients, prices, dishes, versions, composition replace, publish. Runbook: **`docs/KITCHEN_CATALOG_API_V1.md`**. Proof: `npm run prove:kitchen-catalog` (add `--http` with running API).

## Menu-day economics linkage

- **Module:** `backend/src/menuDayItemEconomics.js` — `resolveMenuDayEconomicsFields(prisma, dishVersionId)`
- **Snapshot time `at`:** `new Date()` at the instant of the protected **upsert** (server clock). That same instant is stored in `foodCostSnapshottedAt`.
- **Rules:**
  - Body **includes** `dishVersionId` and it is **null** / empty string → clear `dishVersionId`, `foodCostKopeksSnapshot`, `foodCostSnapshottedAt`.
  - Body **omits** `dishVersionId` → on **update**, keep existing economics fields; on **create**, economics stay null.
  - Body **includes** non-null `dishVersionId` → version must exist and `status === 'published'`; then `foodCostKopeks(prisma, id, at)`; on any throw (e.g. missing `IngredientPrice`), the **protected write fails** (HTTP 400, `MENU_ECONOMICS_ERROR`).
- **No retroactive recompute:** existing rows unchanged until a new protected upsert touches them.
- **Public API:** `GET /api/public/menu-day` response shape unchanged — only `items[].position`, `name`, `price` (no economics fields exposed).

### Protected HTTP (CRM token `X-CRM-Token`)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/menu-day-items?branchId=&date=` | List rows with economics fields |
| PUT | `/api/menu-day-items/upsert` | Body: `{ branchId, date, position, name, price, dishVersionId?: string \| null }` — upsert + snapshot |

## Proof / dev

- **Seed:** `npm run db:seed:kitchen` → dish `"Kitchen demo pilaf"`, published version 1, two lines; expected total **24900** kopeks at any `at` ≥ 2020-01-01.
- **CLI:** `npm run test:food-cost` (optional args: `versionId`, `at` ISO).
- **HTTP (CRM token):** `GET /api/debug/food-cost?versionId=…&at=…` — same payload as CLI JSON shape under `{ ok, data }`.
- **End-to-end (API running):** `npm run prove:menu-day-economics` — upserts a slot with demo `dishVersionId`, asserts snapshot **24900**, checks public menu JSON has no economics keys.

## Not implemented yet (by design)

- Overlap validation on `IngredientPrice` intervals (application layer later)
- Stock, suppliers, full kitchen CRUD UI
- Margin dashboard
- Automatic version bump when recipe changes (manual `DishVersion` workflow still)
