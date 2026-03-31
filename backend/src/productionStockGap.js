/**
 * Production vs Stock Gap v1 — сравнение суточной потребности (рецепты × заказы) с остатками по журналу.
 */

import { buildDayProductionRequirementsPayload } from './dayProductionRequirements.js';
import { buildStockBalancesForBranch } from './stockMovement.js';

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} branchId
 * @param {string} date
 */
export async function buildProductionStockGapPayload(prisma, branchId, date) {
  const [prod, balances] = await Promise.all([
    buildDayProductionRequirementsPayload(prisma, branchId, date),
    buildStockBalancesForBranch(prisma, branchId)
  ]);

  /** @type {Map<string, number>} */
  const balanceByKey = new Map();
  for (const b of balances) {
    balanceByKey.set(`${b.ingredientId}\t${b.unitId}`, b.balance);
  }

  /** @type {Array<{ ingredientId: string, ingredientName: string, unitId: string, unitCode: string, unitDisplayName: string, requiredQty: number, balanceQty: number, gapQty: number, status: string }>} */
  const rows = [];

  for (const req of prod.ingredientDemand) {
    const requiredQty = Number(req.requiredQty);
    if (!Number.isFinite(requiredQty) || requiredQty <= 0) {
      continue;
    }

    const key = `${req.ingredientId}\t${req.unitId}`;
    const balanceQty = balanceByKey.has(key) ? Number(balanceByKey.get(key)) : 0;
    const gapQty = balanceQty - requiredQty;

    let status;
    if (balanceQty < 0) {
      status = 'negative_before_production';
    } else if (gapQty < 0) {
      status = 'shortage';
    } else {
      status = 'enough';
    }

    rows.push({
      ingredientId: req.ingredientId,
      ingredientName: req.ingredientName,
      unitId: req.unitId,
      unitCode: req.unitCode,
      unitDisplayName: req.unitDisplayName,
      requiredQty,
      balanceQty,
      gapQty,
      status
    });
  }

  rows.sort((a, b) => a.ingredientName.localeCompare(b.ingredientName, 'ru'));

  let shortageCount = 0;
  let negativeBeforeProductionCount = 0;
  for (const r of rows) {
    if (r.status === 'shortage') shortageCount += 1;
    if (r.status === 'negative_before_production') negativeBeforeProductionCount += 1;
  }

  return {
    branchId: String(branchId),
    date: String(date),
    summary: {
      ingredientCount: rows.length,
      shortageCount,
      negativeBeforeProductionCount,
      requiredLineCount: rows.length
    },
    rows
  };
}
