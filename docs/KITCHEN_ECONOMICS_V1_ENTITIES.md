# Kitchen Economics v1 — Entity relationship companion

Short reference for **KITCHEN_ECONOMICS_V1_SPEC.md**. English only.

## Relationship sketch (v1)

```
Unit ─────────────────────────────────────────┐
   ▲                                           │
   │                                           │
Ingredient ─── IngredientPrice (time-bounded)   │
   ▲                                           │
   │                                           │
   ├──── DishIngredient ◄── DishVersion ◄── Dish
   │              │
   │              └── quantity, unitId (line)
   │
MenuDayItem (branch, date, position)
   ├── sellingPriceKopeks  (existing: price)
   ├── dishId              (to add)
   ├── dishVersionId       (to add, published only)
   └── foodCostKopeksSnapshot (to add, at publish)
```

## Cardinality (normative)

| From | To | Cardinality (v1) |
|------|----|------------------|
| Dish | DishVersion | 1 : many |
| DishVersion | DishIngredient | 1 : many |
| Ingredient | DishIngredient | 1 : many |
| Ingredient | IngredientPrice | 1 : many (time series) |
| Branch + date + position | MenuDayItem | 1 : 1 (unique) |
| MenuDayItem | DishVersion | many : 1 (each cell one published version) |

## REQUIRED IN V1 vs LATER (quick)

| Entity / concern | Tier |
|------------------|------|
| Unit, Ingredient, IngredientPrice, Dish, DishVersion, DishIngredient | REQUIRED IN V1 |
| MenuDayItem economics fields + publish snapshot | REQUIRED IN V1 |
| Ingredient Group | LATER |
| Order-line food cost copy | LATER (open) |
| Stock movements, suppliers | OUT OF SCOPE |
