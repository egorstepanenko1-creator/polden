/**
 * Приёмка по черновику закупки v1 — RECEIPT в журнал, накопление по строкам, статус черновика.
 */

import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { movementSignedQuantity } from './stockMovement.js';

const EPS = 1e-9;

/**
 * @param {Array<{ purchaseNeedQty: unknown, receivedBaseQtyTotal?: unknown }>} lines
 */
export function computeDraftReceiptStatus(lines) {
  let anyReceived = false;
  let allComplete = true;
  for (const ln of lines) {
    const need = Number(ln.purchaseNeedQty);
    const got = Number(ln.receivedBaseQtyTotal ?? 0);
    if (!Number.isFinite(need) || need < 0) continue;
    if (got > EPS) anyReceived = true;
    if (got + EPS < need) allComplete = false;
  }
  if (!anyReceived) return 'NONE';
  if (allComplete) return 'RECEIVED_FULL';
  return 'RECEIVED_PARTIAL';
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} draftId
 * @param {{ lines: Array<{ purchaseDraftLineId: string, receivedPacks?: unknown, receivedQuantity?: unknown }>, confirm?: boolean }} body
 */
export async function processPurchaseDraftReceive(prisma, draftId, body) {
  const confirm = body.confirm === true;
  const rawLines = body.lines;
  if (!Array.isArray(rawLines)) {
    const e = new Error('lines должен быть массивом');
    e.code = 'VALIDATION';
    throw e;
  }

  const seenIds = new Set();
  for (const entry of rawLines) {
    const lid = entry?.purchaseDraftLineId != null ? String(entry.purchaseDraftLineId).trim() : '';
    if (!lid) {
      const e = new Error('У каждой записи укажите purchaseDraftLineId');
      e.code = 'VALIDATION';
      throw e;
    }
    if (seenIds.has(lid)) {
      const e = new Error(`Дубликат purchaseDraftLineId в запросе: ${lid}`);
      e.code = 'VALIDATION';
      throw e;
    }
    seenIds.add(lid);
  }

  const draft = await prisma.purchaseDraft.findUnique({
    where: { id: String(draftId).trim() },
    include: {
      branch: { select: { id: true, name: true } },
      lines: {
        orderBy: { id: 'asc' },
        include: {
          ingredient: { select: { id: true, name: true, defaultUnitId: true } },
          unit: { select: { id: true, code: true, displayName: true } },
          supplier: { select: { id: true, name: true } }
        }
      }
    }
  });

  if (!draft) {
    const e = new Error('Черновик не найден');
    e.code = 'NOT_FOUND';
    throw e;
  }

  const lineById = new Map(draft.lines.map((ln) => [ln.id, ln]));

  /** @type {Array<{ lineId: string, deltaBaseQty: number, ingredientId: string, unitId: string, note: string }>} */
  const movements = [];

  for (const entry of rawLines) {
    const lineId = String(entry.purchaseDraftLineId).trim();
    const line = lineById.get(lineId);
    if (!line) {
      const e = new Error(`Строка не принадлежит черновику: ${lineId}`);
      e.code = 'VALIDATION';
      throw e;
    }

    const hasPack = line.packQuantity != null && Number(line.packQuantity) > 0;

    let deltaBase = 0;

    if (hasPack) {
      if (entry.receivedQuantity != null && String(entry.receivedQuantity).trim() !== '') {
        const e = new Error(
          `Строка ${lineId}: при заданной упаковке указывайте только receivedPacks (целое число ≥ 0), не receivedQuantity`
        );
        e.code = 'VALIDATION';
        throw e;
      }
      const pk = entry.receivedPacks;
      if (pk == null || pk === '') {
        continue;
      }
      const packs = Number(pk);
      if (!Number.isInteger(packs) || packs < 0) {
        const e = new Error(`Строка ${lineId}: receivedPacks — целое число ≥ 0`);
        e.code = 'VALIDATION';
        throw e;
      }
      const packQty = Number(line.packQuantity);
      deltaBase = packs * packQty;
    } else {
      if (entry.receivedPacks != null && String(entry.receivedPacks).trim() !== '') {
        const e = new Error(
          `Строка ${lineId}: нет размера упаковки в черновике — укажите receivedQuantity в базовых единицах`
        );
        e.code = 'VALIDATION';
        throw e;
      }
      const rq = entry.receivedQuantity;
      if (rq == null || rq === '') {
        continue;
      }
      const q = Number(String(rq).replace(',', '.'));
      if (!Number.isFinite(q) || q < 0) {
        const e = new Error(`Строка ${lineId}: receivedQuantity — конечное число ≥ 0`);
        e.code = 'VALIDATION';
        throw e;
      }
      deltaBase = q;
    }

    if (!Number.isFinite(deltaBase) || deltaBase <= 0) {
      continue;
    }

    if (line.unitId !== line.ingredient.defaultUnitId) {
      const e = new Error(`Строка ${lineId}: unitId не совпадает с defaultUnitId ингредиента (v1 stock)`);
      e.code = 'VALIDATION';
      throw e;
    }

    movements.push({
      lineId,
      deltaBaseQty: deltaBase,
      ingredientId: line.ingredientId,
      unitId: line.unitId,
      note: ''
    });
  }

  if (movements.length === 0) {
    const e = new Error('Нет положительных количеств приёмки — укажите receivedPacks или receivedQuantity');
    e.code = 'VALIDATION';
    throw e;
  }

  const batchRef = randomUUID();
  const occurredAt = new Date();

  for (const m of movements) {
    m.note = `PURCHASE_DRAFT_RECEIPT draftId=${draft.id} lineId=${m.lineId} batch=${batchRef}`.slice(0, 2000);
    movementSignedQuantity('RECEIPT', m.deltaBaseQty);
  }

  /** @type {Array<{ lineId: string, deltaBaseQty: number, previousReceived: number, newReceived: number, purchaseNeedQty: number }>} */
  const lineResults = [];

  for (const m of movements) {
    const line = lineById.get(m.lineId);
    const prev = Number(line.receivedBaseQtyTotal ?? 0);
    lineResults.push({
      lineId: m.lineId,
      deltaBaseQty: m.deltaBaseQty,
      previousReceived: prev,
      newReceived: prev + m.deltaBaseQty,
      purchaseNeedQty: Number(line.purchaseNeedQty)
    });
  }

  const previewLines = draft.lines.map((ln) => {
    const hit = lineResults.find((r) => r.lineId === ln.id);
    const prev = Number(ln.receivedBaseQtyTotal ?? 0);
    const delta = hit?.deltaBaseQty ?? 0;
    const newRec = prev + delta;
    const need = Number(ln.purchaseNeedQty);
    return {
      purchaseDraftLineId: ln.id,
      ingredientName: ln.ingredient.name,
      deltaBaseQty: delta,
      previousReceivedBaseQty: prev,
      newReceivedBaseQtyTotal: newRec,
      purchaseNeedQty: need,
      remainingNeedQty: Math.max(need - newRec, 0)
    };
  });

  const newReceiptStatus = computeDraftReceiptStatus(
    draft.lines.map((ln) => {
      const hit = lineResults.find((r) => r.lineId === ln.id);
      const prev = Number(ln.receivedBaseQtyTotal ?? 0);
      const delta = hit?.deltaBaseQty ?? 0;
      return { purchaseNeedQty: ln.purchaseNeedQty, receivedBaseQtyTotal: prev + delta };
    })
  );

  if (!confirm) {
    return {
      preview: true,
      draftId: draft.id,
      batchRef,
      occurredAt: occurredAt.toISOString(),
      receiptStatusAfter: newReceiptStatus,
      movements: movements.map((m) => ({
        purchaseDraftLineId: m.lineId,
        ingredientId: m.ingredientId,
        unitId: m.unitId,
        movementType: 'RECEIPT',
        quantity: m.deltaBaseQty,
        note: m.note
      })),
      lines: previewLines,
      createdMovementCount: movements.length
    };
  }

  const createdIds = await prisma.$transaction(async (tx) => {
    const ids = [];
    for (const m of movements) {
      const row = await tx.stockMovement.create({
        data: {
          branchId: draft.branchId,
          ingredientId: m.ingredientId,
          unitId: m.unitId,
          movementType: 'RECEIPT',
          quantity: new Prisma.Decimal(String(m.deltaBaseQty)),
          occurredAt,
          note: m.note
        }
      });
      ids.push(row.id);

      const cur = await tx.purchaseDraftLine.findUnique({ where: { id: m.lineId } });
      const prev = Number(cur?.receivedBaseQtyTotal ?? 0);
      await tx.purchaseDraftLine.update({
        where: { id: m.lineId },
        data: {
          receivedBaseQtyTotal: new Prisma.Decimal(String(prev + m.deltaBaseQty))
        }
      });
    }

    const updatedLines = await tx.purchaseDraftLine.findMany({
      where: { purchaseDraftId: draft.id },
      select: { purchaseNeedQty: true, receivedBaseQtyTotal: true }
    });
    const rs = computeDraftReceiptStatus(updatedLines);

    await tx.purchaseDraft.update({
      where: { id: draft.id },
      data: {
        receiptStatus: rs,
        lastReceivedAt: occurredAt
      }
    });

    return ids;
  });

  const fullDraft = await prisma.purchaseDraft.findUniqueOrThrow({
    where: { id: draft.id },
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

  return {
    preview: false,
    draftId: draft.id,
    batchRef,
    occurredAt: occurredAt.toISOString(),
    createdMovementIds: createdIds,
    createdMovementCount: createdIds.length,
    receiptStatus: fullDraft.receiptStatus,
    draft: fullDraft
  };
}
