/**
 * Day Production Requirements v1 — sold qty × recipe lines from MenuDayItem.dishVersionId.
 * Read-only; no stock. Excludes positions without valid published recipe from ingredient totals.
 */

/**
 * Проверка версии блюда для производства/списания: published, непустой состав, qty ≥ 0, unitId = defaultUnitId ингредиента.
 * @param {null | { status: string, lines: Array<{ quantity: unknown, unitId: string, ingredient: { defaultUnitId: string } }> }} version
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export function validateDishVersionForProduction(version) {
  if (!version) {
    return { ok: false, reason: 'version_not_found' };
  }
  if (version.status !== 'published') {
    return { ok: false, reason: 'not_published' };
  }
  if (!version.lines?.length) {
    return { ok: false, reason: 'empty_composition' };
  }
  for (const line of version.lines) {
    const ing = line.ingredient;
    if (!ing || line.unitId !== ing.defaultUnitId) {
      return { ok: false, reason: 'unit_mismatch' };
    }
    const q = Number(line.quantity);
    if (!Number.isFinite(q) || q < 0) {
      return { ok: false, reason: 'invalid_quantity' };
    }
  }
  return { ok: true };
}

/**
 * @param {Array<{ items: Array<{ position: number, qty: number }> }>} orders
 * @returns {Map<number, number>}
 */
export function aggregateOrderedQtyByPosition(orders) {
  const qtyByPos = new Map();
  for (const o of orders) {
    for (const it of o.items || []) {
      const pos = Number(it.position);
      if (!Number.isInteger(pos)) continue;
      const q = Number(it.qty);
      if (!Number.isFinite(q) || q < 0) continue;
      qtyByPos.set(pos, (qtyByPos.get(pos) || 0) + Math.floor(q));
    }
  }
  return qtyByPos;
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} branchId
 * @param {string} date
 */
export async function buildDayProductionRequirementsPayload(prisma, branchId, date) {
  const [menuRows, orders] = await Promise.all([
    prisma.menuDayItem.findMany({
      where: { branchId: String(branchId), date: String(date) },
      orderBy: { position: 'asc' },
      select: {
        id: true,
        position: true,
        name: true,
        dishVersionId: true
      }
    }),
    prisma.deliveryOrder.findMany({
      where: { branchId: String(branchId), deliveryDate: String(date) },
      select: {
        items: { select: { position: true, qty: true } }
      }
    })
  ]);

  const qtyByPos = aggregateOrderedQtyByPosition(orders);

  const versionIds = [...new Set(menuRows.map((m) => m.dishVersionId).filter(Boolean))];
  const versions =
    versionIds.length === 0
      ? []
      : await prisma.dishVersion.findMany({
          where: { id: { in: versionIds } },
          include: {
            dish: { select: { name: true } },
            lines: {
              include: {
                ingredient: { include: { defaultUnit: true } },
                unit: true
              }
            }
          }
        });
  const versionById = new Map(versions.map((v) => [v.id, v]));

  /** @type {Map<string, { ingredientId: string, ingredientName: string, unitId: string, unitCode: string, unitDisplayName: string, requiredQty: number }>} */
  const demandMap = new Map();

  const positions = [];

  for (const m of menuRows) {
    const orderedQty = qtyByPos.get(m.position) || 0;
    const productionQty = orderedQty;
    /** @type {string} */
    let productionStatus;
    let invalidReason = null;
    /** @type {string | null} */
    let dishName = null;

    if (orderedQty === 0) {
      productionStatus = 'not_sold';
    } else if (!m.dishVersionId) {
      productionStatus = 'sold_without_recipe';
    } else {
      const v = versionById.get(m.dishVersionId);
      dishName = v?.dish?.name ?? null;
      if (!v) {
        productionStatus = 'invalid_recipe';
        invalidReason = 'version_not_found';
      } else {
        const vr = validateDishVersionForProduction(v);
        if (vr.ok) {
          productionStatus = 'producible';
          for (const line of v.lines) {
            const q = Number(line.quantity);
            const add = q * orderedQty;
            const key = `${line.ingredientId}\t${line.unitId}`;
            const prev = demandMap.get(key);
            if (prev) {
              prev.requiredQty += add;
            } else {
              demandMap.set(key, {
                ingredientId: line.ingredientId,
                ingredientName: line.ingredient.name,
                unitId: line.unitId,
                unitCode: line.unit.code,
                unitDisplayName: line.unit.displayName,
                requiredQty: add
              });
            }
          }
        } else {
          productionStatus = 'invalid_recipe';
          invalidReason = vr.reason;
        }
      }
    }

    positions.push({
      menuDayItemId: m.id,
      position: m.position,
      name: m.name,
      orderedQty,
      productionQty,
      dishVersionId: m.dishVersionId,
      dishName,
      productionStatus,
      invalidReason
    });
  }

  let soldSlotCount = 0;
  let linkedSoldSlotCount = 0;
  let soldMissingRecipeCount = 0;
  let soldInvalidRecipeCount = 0;
  let totalOrderedPortions = 0;

  for (const p of positions) {
    totalOrderedPortions += p.orderedQty;
    if (p.orderedQty > 0) {
      soldSlotCount += 1;
      if (p.productionStatus === 'producible') linkedSoldSlotCount += 1;
      else if (p.productionStatus === 'sold_without_recipe') soldMissingRecipeCount += 1;
      else if (p.productionStatus === 'invalid_recipe') soldInvalidRecipeCount += 1;
    }
  }

  const ingredientDemand = [...demandMap.values()].sort((a, b) =>
    a.ingredientName.localeCompare(b.ingredientName, 'ru')
  );

  return {
    branchId: String(branchId),
    date: String(date),
    summary: {
      activeSlotCount: menuRows.length,
      soldSlotCount,
      linkedSoldSlotCount,
      soldMissingRecipeCount,
      soldInvalidRecipeCount,
      totalOrderedPortions,
      ingredientDemandLineCount: ingredientDemand.length
    },
    positions,
    ingredientDemand
  };
}
