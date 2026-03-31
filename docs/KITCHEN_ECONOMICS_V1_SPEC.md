# Kitchen Economics — Basic Spec v1 (Polden / CRM crm-mvp)

**Language:** English (normative for this document).  
**Status:** Specification only — no implementation commitment in this file.  
**Repo context:** Aligns with existing `MenuDayItem` (branch, date, position, `name`, `price` in kopeks) and public ordering; economics layer is **not** implemented yet.

---

## 1. Purpose and scope

### Why Kitchen Economics v1 exists

Polden is moving from an order-centric system to a **food operating system**. Before adding recipes, ingredients, and cost views, the team needs a **single disciplined model** so data stays consistent and rewrites stay cheap.

### What v1 solves now

- **Definitions:** What entities exist, what they mean, and how they connect.
- **Source of truth:** Where composition lives, where prices live, how cost is derived.
- **Immutability rules:** How menu days and orders avoid retroactive distortion when prices or recipes change.
- **Versioning:** How dish changes are tracked over time without rewriting history.

### Explicitly out of scope for v1

| OUT OF SCOPE (v1) | Notes |
|-------------------|--------|
| Full warehouse / bin-level inventory | No stock movements, reservations, or pick paths. |
| Supplier purchase orders, invoices, GRN | Procurement workflow deferred. |
| Production scheduling, HACCP, batch traceability | Operational compliance layer later. |
| Multi-currency, tax engines, complex allocations | Single currency (RUB) implied; prices in minor units (kopeks). |
| Nutrition / allergens as regulated master data | May attach plain text later; not v1 blocker. |
| Automatic recipe optimization or costing AI | Human-maintained quantities only. |

---

## 2. Core entities for v1

### Legend

- **REQUIRED IN V1** — Must exist in data model (or equivalent) before economics features ship.
- **LATER** — Planned but not required for first economics release.
- **OUT OF SCOPE** — As in §1.

---

### Unit — **REQUIRED IN V1**

A normalized measure used for ingredients (e.g. `g`, `kg`, `ml`, `l`, `pcs`, `tbsp` — keep enum or controlled vocabulary small).

- Stores: code, display label, optional `baseUnit` + factor for conversions **if** you allow derived units in v1 (see Open questions).
- **LATER:** Full dimensional analysis, density tables for mass↔volume of arbitrary SKUs.

---

### Ingredient — **REQUIRED IN V1**

A purchasable or stock-tracked input used in recipes (e.g. “Chicken breast”, “Sunflower oil”).

- Stores: `id`, `name`, default `unitId`, optional `sku` / internal code, `active` flag.
- **No** requirement in v1 for per-branch ingredient master (assume global catalog; branch overrides **LATER**).

---

### Ingredient Group — **LATER** (not required in v1)

Use only if UX or reporting needs taxonomy early (e.g. “Proteins”, “Dry goods”). If not needed for first screens, **omit** to avoid extra CRUD.

---

### Dish — **REQUIRED IN V1**

A stable product identity sold to customers (logical dish: “Borscht”, “Caesar salad”).

- Stores: `id`, `name`, `active`, optional `category` string or enum.
- **Does not** store recipe rows or cost — those live on **Dish Version**.

---

### Dish Version — **REQUIRED IN v1**

An immutable snapshot of **composition** (and optionally yield metadata) for a dish at a point in time.

- Stores: `id`, `dishId`, `versionLabel` or monotonic `versionNumber`, `createdAt`, `createdBy` (optional), `status` (`draft` | `published`), optional `notes`.
- **All** ingredient lines attach to a **Dish Version**, not to `Dish` directly.

---

### Dish Ingredient (recipe line) — **REQUIRED IN v1**

One row: “this version uses X amount of ingredient Y in unit Z”.

- Stores: `dishVersionId`, `ingredientId`, `quantity` (decimal), `unitId` (must be compatible with ingredient’s allowed units — v1: same as ingredient default unit unless conversion table exists).
- **LATER:** Alternatives, optional ingredients, scaling rules by portion count.

---

### Ingredient Price — **REQUIRED IN v1**

A **time-bounded** price for an ingredient (for costing).

- Stores: `ingredientId`, `pricePerUnit` (minor currency per **one** `unitId` as defined), `unitId`, `validFrom` (required), `validTo` (nullable = open-ended), optional `source` (`manual` | `import` for future).
- **Authoritative for costing** only for intervals where the row is valid. Overlaps **must** be forbidden or resolved by rule (see §4).

---

### Menu economics / price snapshot linkage — **REQUIRED IN v1**

Today the repo has `MenuDayItem` (per branch, date, position, `name`, `price`). For v1 economics:

- Each `MenuDayItem` (or successor row) **must** be able to point to:
  - **`dishId`** (optional until migration),
  - **`dishVersionId`** used for that menu cell (**required** once dish master exists),
  - **`foodCostKopeksSnapshot`** — integer, frozen at publish time for that branch+date+position,
  - **`sellingPriceKopeks`** — already present as `price`; remains selling price snapshot.
- **Naming in spec:** “menu cost snapshot” = the stored pair (or tuple) linking **published dish version** + **frozen food cost** + **selling price** for that menu cell.

**LATER:** Separate table `MenuDayItemEconomics` if normalization preferred; v1 may add columns on `MenuDayItem` if simpler.

---

## 3. Source-of-truth rules

| Question | Answer (v1) |
|----------|-------------|
| Where does **dish composition** live? | Only on **Dish Version** via **Dish Ingredient** rows. `Dish` has no recipe lines. |
| Where do **ingredient prices** live? | **Ingredient Price** rows (time-bounded). Not on `Ingredient` as a single static field once history matters. |
| What is authoritative **at costing time**? | For a given timestamp `t`: the **published Dish Version** chosen for the menu cell + **Ingredient Price** rows valid at `t` for each line’s ingredient and unit. |
| How is **dish food cost** calculated? | Sum over lines: `quantity × pricePerUnit` (after unit alignment); result in kopeks; see §4. |
| How should **menu-day** snapshot economics? | When a menu day (or a position) is **published** for a branch+date, compute `foodCostKopeksSnapshot` from current published version + active prices at publish time; **persist** on `MenuDayItem` (or child record). |
| What happens when **prices change later**? | **No retroactive change** to published `foodCostKopeksSnapshot` or historical orders. New prices apply to **new** publishes and **draft** menus only. |
| What happens when **recipe changes**? | Create a **new Dish Version**; existing published menu rows keep old `dishVersionId` + snapshot until explicitly republished. |

---

## 4. Costing rules

### Ingredient quantity basis

- Quantities on **Dish Ingredient** are in the **recipe unit** (`unitId` on the line).
- **Ingredient Price** must quote **the same unit** as used on the line, or v1 must define a single conversion table (see Open questions). **No silent mismatch.**

### Waste / yield (v1)

- **Postpone** detailed yield factors (trim loss, cooking loss) as separate fields.
- **Allowed v1 shortcut:** incorporate expected loss into **effective quantity** on the line (document in `notes` on Dish Version) **or** add a single `yieldFactor` (default `1.0`) per line in v1 if product insists — prefer **postpone** to keep v1 minimal.

### Rounding

- Per-line monetary product: use **half-up** to integer kopeks, or fixed 4 decimal minor then round once at line level — **pick one** in implementation and apply consistently.
- **Dish total food cost:** sum of **already-rounded** line kopeks (recommended) to avoid double-rounding drift; document choice.

### Dish food cost (formula)

For dish version `V` at evaluation time `t`:

```
foodCostKopeks(V, t) = Σ over lines L in V:
  roundToKopeks( L.quantity × unitPrice(L.ingredientId, L.unitId, t) )
```

Where `unitPrice(..., t)` resolves the **single applicable** `Ingredient Price` row.

### Menu / day / order reading cost truth

| Consumer | Reads |
|----------|--------|
| **Published MenuDayItem** | `foodCostKopeksSnapshot`, `sellingPriceKopeks`, `dishVersionId` — **frozen**. |
| **Draft menu** | Live calculation from current draft version + prices at “preview” time (not written until publish). |
| **Order line (v1)** | May **LATER** copy snapshot from menu; v1 orders already use position + public price — **food cost on order line is LATER** unless required for margin report (see Open questions). |

### Avoiding retroactive distortion

- Published snapshots and historical menu rows are **immutable** except for controlled admin “unpublish” (out of scope unless legally required).
- **Ingredient Price** edits **never** back-date into closed menu snapshots.

---

## 5. Versioning rules

### Why Dish Version exists

Recipes change. Customers and finance must see **what was true** when a menu was sold. A monolithic mutable recipe on `Dish` breaks audit and snapshots.

### When a new version is created

- Any change to **Dish Ingredient** lines (qty, unit, ingredient choice) → **new Dish Version** (clone from previous allowed).
- **Cosmetic** dish name change on `Dish` does not require a new version; **material** description changes: **LATER** policy (default: still new version if printed on labels).

### Historical menu / day records

- **Must** store `dishVersionId` (and frozen `foodCostKopeksSnapshot`) for each published cell.
- Historical reports join menu row → version → (optional) line detail for **that** version only.

### Edits vs old vs future menu dates

- **Past published dates:** not auto-updated.
- **Future published dates:** operator may **re-publish** to bump version + recompute snapshot.
- **Draft future menus:** may point at `draft` version until publish locks version + snapshot.

---

## 6. V1 workflows

### Creating an ingredient

1. Create `Ingredient` with name + default `unitId`.
2. Add initial `Ingredient Price` with `validFrom` = today (or go-live date).

### Updating ingredient price

1. Close previous open-ended price: set `validTo` on old row (or insert new row with `validFrom` and enforce no gaps/overlap per rules).
2. Insert new `Ingredient Price` with new `pricePerUnit` from `validFrom`.
3. **Do not** rewrite existing menu snapshots.

### Creating / editing a dish version

1. Create new `Dish Version` under `Dish` (from draft or clone).
2. Add/edit **Dish Ingredient** lines only while version is `draft`.
3. **Publish** version when ready; only **published** versions are attachable to menu publish.

### Attaching a dish to menu / day

1. For `MenuDayItem` at `(branchId, date, position)`, set `dishId` + choose **published** `dishVersionId`.
2. On **publish** of that menu cell (or whole day): compute and write `foodCostKopeksSnapshot` and ensure `price` (selling) is set.

### Freezing / snapshotting cost for a menu date

1. Run costing for each cell: `foodCostKopeksSnapshot = foodCostKopeks(dishVersion, publishTime)`.
2. Persist on row; record `publishedAt` (optional field) for audit.
3. Public APIs continue to expose **selling** `price`; **food cost** remains **internal** (CRM-only) unless product decides otherwise.

---

## 7. Minimal API / domain capabilities (next step, not full design)

Likely needed soon (names indicative):

- CRUD **Ingredient**, **Unit** (read-heavy).
- CRUD **Ingredient Price** with validation (no overlaps).
- CRUD **Dish**, **Dish Version** (draft lifecycle), **Dish Ingredient**.
- **Publish** actions: dish version publish; menu day / menu item publish with snapshot write.
- **Preview cost** endpoint: given `dishVersionId`, return computed food cost at `now` or given `t`.
- **Report:** margin per `MenuDayItem` = `sellingPriceKopeks - foodCostKopeksSnapshot` (internal dashboard).

**LATER:** Stock deduction, order-level cost allocation, supplier APIs.

---

## 8. Open questions (genuine decisions)

1. **Unit conversion:** v1 only default unit per ingredient, or small built-in conversion table (kg↔g, l↔ml)?
2. **Ingredient Price overlaps:** strict single active row per ingredient+unit, or priority rule?
3. **Order line economics:** copy snapshot at order time for margin reporting, or derive from menu history join only?
4. **Branch-specific prices:** global vs per-branch `Ingredient Price` for v1?
5. **Draft menu visibility:** can two draft versions of same dish coexist on different future dates?

---

## 9. Recommended next implementation order

1. **Models:** `Unit`, `Ingredient`, `Ingredient Price`, `Dish`, `Dish Version`, `Dish Ingredient`.
2. **Validation:** price interval rules; publish guards (draft vs published).
3. **Calculation service:** `foodCostKopeks(versionId, at)` with explicit rounding policy.
4. **Screens (CRM):** ingredient list + price history; dish list + version editor; cost preview.
5. **Menu integration:** extend `MenuDayItem` (or parallel table) with `dishVersionId` + `foodCostKopeksSnapshot` + publish flow.
6. **Internal KPI:** simple margin view per menu day (selling − food cost).

---

## Consistency with current repo

- **Existing:** `MenuDayItem` holds customer-facing **selling price** (`price` in kopeks) per branch/date/position — treat as **selling snapshot** for v1 alignment.
- **Not yet present:** `dishId`, `dishVersionId`, `foodCostKopeksSnapshot`, ingredient/recipe tables — to be added per this spec.

---

*End of Kitchen Economics v1 spec.*
