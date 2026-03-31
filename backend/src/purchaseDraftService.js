/**
 * Purchase Draft v1 — генерация из снимка потребности; строки неизменяемы после создания.
 */

import { Prisma } from '@prisma/client';
import { buildPurchaseNeedSnapshotPayload } from './purchaseNeedSnapshot.js';

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {{ branchId: string, date: string, at?: Date, note?: string | null }} input
 */
export async function generatePurchaseDraft(prisma, input) {
  const branchId = String(input.branchId).trim();
  const date = String(input.date).trim();
  const at =
    input.at instanceof Date && !Number.isNaN(input.at.getTime()) ? input.at : new Date();
  const note = input.note != null ? String(input.note).trim().slice(0, 2000) || null : null;

  const br = await prisma.branch.findUnique({ where: { id: branchId } });
  if (!br) {
    const e = new Error('Филиал не найден');
    e.code = 'NOT_FOUND';
    throw e;
  }

  const snapshot = await buildPurchaseNeedSnapshotPayload(prisma, branchId, date, { at });

  if (snapshot.rows.length === 0) {
    const e = new Error(
      'Нет строк потребности в закупке (purchaseNeedLineCount = 0): нечего включить в черновик. Проверьте дату, заказы и остатки.'
    );
    e.code = 'VALIDATION';
    throw e;
  }

  const draft = await prisma.$transaction(async (tx) => {
    const d = await tx.purchaseDraft.create({
      data: {
        branchId,
        date,
        status: 'DRAFT',
        note,
        sourceEvaluatedAt: at
      }
    });

    for (const row of snapshot.rows) {
      const opt = row.supplierOption;
      await tx.purchaseDraftLine.create({
        data: {
          purchaseDraftId: d.id,
          ingredientId: row.ingredientId,
          unitId: row.unitId,
          purchaseNeedQty: new Prisma.Decimal(String(row.purchaseNeedQty)),
          supplierId: opt?.supplierId ?? null,
          supplierOfferId: opt?.offerId ?? null,
          packQuantity: opt != null ? new Prisma.Decimal(String(opt.packQuantity)) : null,
          pricePerPackKopeks: opt?.pricePerPackKopeks ?? null,
          estimatedPacksNeeded: opt?.estimatedPacksNeeded ?? null,
          estimatedBuyCostKopeks: opt?.estimatedBuyCostKopeks ?? null
        }
      });
    }

    return tx.purchaseDraft.findUniqueOrThrow({
      where: { id: d.id },
      include: {
        branch: { select: { id: true, name: true } },
        lines: {
          orderBy: { id: 'asc' },
          include: {
            ingredient: { select: { id: true, name: true } },
            unit: { select: { id: true, code: true, displayName: true } },
            supplier: { select: { id: true, name: true } }
          }
        }
      }
    });
  });

  return draft;
}

/**
 * @param {any} draft prisma result with lines + includes
 */
export function serializePurchaseDraft(draft) {
  const lines = (draft.lines || []).map((ln) => {
    const need = Number(ln.purchaseNeedQty);
    const got = Number(ln.receivedBaseQtyTotal ?? 0);
    return {
      id: ln.id,
      ingredientId: ln.ingredientId,
      ingredientName: ln.ingredient?.name,
      unitId: ln.unitId,
      unitCode: ln.unit?.code,
      unitDisplayName: ln.unit?.displayName,
      purchaseNeedQty: String(ln.purchaseNeedQty),
      receivedBaseQtyTotal: String(ln.receivedBaseQtyTotal ?? 0),
      remainingNeedQty: Math.max(need - got, 0),
      lineReceiptComplete: got + 1e-9 >= need,
      supplierId: ln.supplierId,
      supplierName: ln.supplier?.name ?? null,
      supplierOfferId: ln.supplierOfferId,
      packQuantity: ln.packQuantity != null ? String(ln.packQuantity) : null,
      pricePerPackKopeks: ln.pricePerPackKopeks,
      estimatedPacksNeeded: ln.estimatedPacksNeeded,
      estimatedBuyCostKopeks: ln.estimatedBuyCostKopeks,
      missingOffer: ln.supplierId == null,
      createdAt: ln.createdAt.toISOString()
    };
  });

  let totalEstimatedCostKopeks = 0;
  let linesWithCost = 0;
  for (const ln of lines) {
    if (ln.estimatedBuyCostKopeks != null && Number.isFinite(ln.estimatedBuyCostKopeks)) {
      totalEstimatedCostKopeks += ln.estimatedBuyCostKopeks;
      linesWithCost += 1;
    }
  }

  return {
    id: draft.id,
    branchId: draft.branchId,
    branchName: draft.branch?.name,
    date: draft.date,
    status: draft.status,
    receiptStatus: draft.receiptStatus ?? 'NONE',
    lastReceivedAt: draft.lastReceivedAt ? draft.lastReceivedAt.toISOString() : null,
    note: draft.note,
    sourceEvaluatedAt: draft.sourceEvaluatedAt.toISOString(),
    createdAt: draft.createdAt.toISOString(),
    updatedAt: draft.updatedAt.toISOString(),
    lines,
    totalEstimatedCostKopeks,
    linesWithCostCount: linesWithCost
  };
}

export function serializePurchaseDraftListItem(draft) {
  return {
    id: draft.id,
    branchId: draft.branchId,
    branchName: draft.branch?.name,
    date: draft.date,
    status: draft.status,
    receiptStatus: draft.receiptStatus ?? 'NONE',
    lastReceivedAt: draft.lastReceivedAt ? draft.lastReceivedAt.toISOString() : null,
    note: draft.note,
    sourceEvaluatedAt: draft.sourceEvaluatedAt.toISOString(),
    createdAt: draft.createdAt.toISOString(),
    lineCount: draft._count?.lines ?? draft.lines?.length ?? 0
  };
}
