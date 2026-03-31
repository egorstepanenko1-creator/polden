/**
 * Purchase Need Snapshot v1 — read-only: что закупить по суточной потребности vs текущий остаток.
 * Переиспользует join потребность/остаток из productionStockGap.
 * Опционально: лучший текущий оффер поставщика (read-only).
 */

import { buildProductionStockGapPayload } from './productionStockGap.js';
import {
  groupOffersByIngredientId,
  loadSupplierOffersForIngredientsAt,
  resolveBestSupplierOptionForRow
} from './supplierOffers.js';

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} branchId
 * @param {string} date
 * @param {{ at?: Date }} [opts]
 */
export async function buildPurchaseNeedSnapshotPayload(prisma, branchId, date, opts = {}) {
  const gap = await buildProductionStockGapPayload(prisma, branchId, date);
  const at =
    opts.at instanceof Date && !Number.isNaN(opts.at.getTime()) ? opts.at : new Date();

  /** @type {Array<{ ingredientId: string, ingredientName: string, unitId: string, unitCode: string, unitDisplayName: string, requiredQty: number, balanceQty: number, purchaseNeedQty: number, status: string, supplierOption: object | null }>} */
  const rows = [];

  for (const r of gap.rows) {
    const purchaseNeedQty = Math.max(r.requiredQty - r.balanceQty, 0);
    if (purchaseNeedQty <= 0) continue;

    const status = r.balanceQty < 0 ? 'negative_before_production' : 'shortage';

    rows.push({
      ingredientId: r.ingredientId,
      ingredientName: r.ingredientName,
      unitId: r.unitId,
      unitCode: r.unitCode,
      unitDisplayName: r.unitDisplayName,
      requiredQty: r.requiredQty,
      balanceQty: r.balanceQty,
      purchaseNeedQty,
      status,
      supplierOption: null
    });
  }

  if (rows.length > 0) {
    const ids = [...new Set(rows.map((x) => x.ingredientId))];
    const offersRaw = await loadSupplierOffersForIngredientsAt(prisma, ids, at);
    const byIng = groupOffersByIngredientId(offersRaw);
    for (const row of rows) {
      row.supplierOption = resolveBestSupplierOptionForRow(byIng, row, at);
    }
  }

  let shortageIngredientCount = 0;
  let negativeBeforeProductionCount = 0;
  for (const row of rows) {
    if (row.status === 'shortage') shortageIngredientCount += 1;
    if (row.status === 'negative_before_production') negativeBeforeProductionCount += 1;
  }

  return {
    branchId: gap.branchId,
    date: gap.date,
    evaluatedAt: at.toISOString(),
    summary: {
      shortageIngredientCount,
      negativeBeforeProductionCount,
      purchaseNeedLineCount: rows.length
    },
    rows
  };
}
