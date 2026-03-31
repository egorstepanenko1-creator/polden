/**
 * Day Production & Sales Economics v1 — aggregate menu-day slots with delivery orders.
 * Uses frozen menu foodCostKopeksSnapshot only; no invented costs.
 */

/**
 * @param {string} branchId
 * @param {string} date
 * @param {Array<{ id: string, position: number, name: string, price: number, foodCostKopeksSnapshot: number | null }>} menuRows
 * @param {Array<{ items: Array<{ position: number, qty: number }> }>} orders
 */
export function buildDayEconomicsPayload(branchId, date, menuRows, orders) {
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

  const positions = menuRows.map((m) => {
    const orderedQty = qtyByPos.get(m.position) || 0;
    const revenueKopeks = m.price * orderedQty;
    const foodCostKopeksSnapshot = m.foodCostKopeksSnapshot;
    const estimatedFoodCostKopeks =
      foodCostKopeksSnapshot != null ? foodCostKopeksSnapshot * orderedQty : null;
    const estimatedGrossMarginKopeks =
      estimatedFoodCostKopeks != null ? revenueKopeks - estimatedFoodCostKopeks : null;
    const economicsStatus = foodCostKopeksSnapshot != null ? 'complete' : 'missing_snapshot';

    return {
      menuDayItemId: m.id,
      position: m.position,
      name: m.name,
      price: m.price,
      orderedQty,
      revenueKopeks,
      foodCostKopeksSnapshot,
      estimatedFoodCostKopeks,
      estimatedGrossMarginKopeks,
      economicsStatus
    };
  });

  let totalOrderedQty = 0;
  let totalRevenueKopeks = 0;
  let totalEstimatedFoodCostKopeks = 0;
  let totalEstimatedGrossMarginKopeks = 0;
  let soldPositionsWithoutSnapshotCount = 0;

  for (const p of positions) {
    totalOrderedQty += p.orderedQty;
    totalRevenueKopeks += p.revenueKopeks;
    if (p.estimatedFoodCostKopeks != null) {
      totalEstimatedFoodCostKopeks += p.estimatedFoodCostKopeks;
      totalEstimatedGrossMarginKopeks += p.estimatedGrossMarginKopeks ?? 0;
    }
    if (p.orderedQty > 0 && p.foodCostKopeksSnapshot == null) {
      soldPositionsWithoutSnapshotCount += 1;
    }
  }

  return {
    branchId: String(branchId),
    date: String(date),
    summary: {
      activeSlotCount: menuRows.length,
      totalOrderedQty,
      totalRevenueKopeks,
      totalEstimatedFoodCostKopeks,
      totalEstimatedGrossMarginKopeks,
      soldPositionsWithoutSnapshotCount
    },
    positions
  };
}
