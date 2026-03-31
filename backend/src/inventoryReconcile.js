/**
 * Инвентаризация и сверка v1 — журнал StockMovement + аудит InventoryCountBatch / Line.
 */

import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { buildStockBalancesForBranch, movementSignedQuantity } from './stockMovement.js';

const EPS = 1e-9;

function balanceKey(ingredientId, unitId) {
  return `${ingredientId}\t${unitId}`;
}

/**
 * Лист пересчёта: все активные ингредиенты каталога; учётный остаток из движений или 0.
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} branchId
 */
export async function buildInventoryCountSheet(prisma, branchId) {
  const balances = await buildStockBalancesForBranch(prisma, String(branchId));
  const balMap = new Map(balances.map((b) => [balanceKey(b.ingredientId, b.unitId), b]));

  const ingredients = await prisma.ingredient.findMany({
    where: { active: true },
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      defaultUnitId: true,
      defaultUnit: { select: { code: true, displayName: true } }
    }
  });

  const rows = ingredients.map((ing) => {
    const k = balanceKey(ing.id, ing.defaultUnitId);
    const b = balMap.get(k);
    return {
      ingredientId: ing.id,
      ingredientName: ing.name,
      unitId: ing.defaultUnitId,
      unitCode: ing.defaultUnit.code,
      unitDisplayName: ing.defaultUnit.displayName,
      systemBalanceQty: b != null ? b.balance : 0
    };
  });

  return {
    branchId: String(branchId),
    rows
  };
}

/**
 * @param {any} batch
 */
export function serializeInventoryCountBatchListItem(batch) {
  return {
    id: batch.id,
    branchId: batch.branchId,
    createdAt: batch.createdAt.toISOString(),
    reconciledAt: batch.reconciledAt.toISOString(),
    note: batch.note,
    rowCount: batch.rowCount,
    changedLineCount: batch.changedLineCount,
    adjustmentInCount: batch.adjustmentInCount,
    adjustmentOutCount: batch.adjustmentOutCount
  };
}

/**
 * @param {any} batch prisma batch + lines + includes
 */
export function serializeInventoryCountBatchDetail(batch) {
  if (!batch) return null;
  return {
    ...serializeInventoryCountBatchListItem(batch),
    branchName: batch.branch?.name,
    lines: (batch.lines || []).map((ln) => ({
      id: ln.id,
      ingredientId: ln.ingredientId,
      ingredientName: ln.ingredient?.name,
      unitId: ln.unitId,
      unitCode: ln.unit?.code,
      unitDisplayName: ln.unit?.displayName,
      systemBalanceQty: String(ln.systemBalanceQty),
      countedQty: String(ln.countedQty),
      differenceQty: String(ln.differenceQty),
      movementType: ln.movementType,
      adjustmentQty: ln.adjustmentQty != null ? String(ln.adjustmentQty) : null,
      stockMovementId: ln.stockMovementId
    }))
  };
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} branchId
 */
export async function listInventoryCountBatches(prisma, branchId) {
  return prisma.inventoryCountBatch.findMany({
    where: { branchId: String(branchId) },
    orderBy: { reconciledAt: 'desc' },
    take: 200
  });
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} batchId
 */
export async function getInventoryCountBatchById(prisma, batchId) {
  return prisma.inventoryCountBatch.findFirst({
    where: { id: String(batchId).trim() },
    include: {
      branch: { select: { id: true, name: true } },
      lines: {
        orderBy: { id: 'asc' },
        include: {
          ingredient: { select: { name: true } },
          unit: { select: { code: true, displayName: true } }
        }
      }
    }
  });
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {{
 *   branchId: string,
 *   rows: Array<{ ingredientId: string, unitId: string, countedQty: unknown }>,
 *   confirm?: boolean,
 *   note?: string | null
 * }} body
 */
export async function processInventoryReconcile(prisma, body) {
  const branchId = body.branchId != null ? String(body.branchId).trim() : '';
  const confirm = body.confirm === true;
  const userNote =
    body.note != null && String(body.note).trim() !== ''
      ? String(body.note).trim().slice(0, 500)
      : null;

  if (!branchId) {
    const e = new Error('branchId обязателен');
    e.code = 'VALIDATION';
    throw e;
  }

  const rawRows = body.rows;
  if (!Array.isArray(rawRows) || rawRows.length === 0) {
    const e = new Error('rows: передайте непустой массив строк инвентаризации');
    e.code = 'VALIDATION';
    throw e;
  }

  const seen = new Set();
  const parsed = [];
  for (const r of rawRows) {
    const ingredientId = r?.ingredientId != null ? String(r.ingredientId).trim() : '';
    const unitId = r?.unitId != null ? String(r.unitId).trim() : '';
    if (!ingredientId || !unitId) {
      const e = new Error('В каждой строке укажите ingredientId и unitId');
      e.code = 'VALIDATION';
      throw e;
    }
    const k = balanceKey(ingredientId, unitId);
    if (seen.has(k)) {
      const e = new Error(`Дубликат пары ingredientId+unitId: ${ingredientId}`);
      e.code = 'VALIDATION';
      throw e;
    }
    seen.add(k);

    const cq = r.countedQty;
    if (cq === null || cq === undefined || String(cq).trim() === '') {
      const e = new Error(`Строка ${ingredientId}: укажите countedQty (число ≥ 0)`);
      e.code = 'VALIDATION';
      throw e;
    }
    const counted = Number(String(cq).replace(',', '.'));
    if (!Number.isFinite(counted) || counted < 0) {
      const e = new Error(`Строка ${ingredientId}: countedQty — конечное число ≥ 0`);
      e.code = 'VALIDATION';
      throw e;
    }
    parsed.push({ ingredientId, unitId, countedQty: counted });
  }

  const br = await prisma.branch.findUnique({ where: { id: branchId } });
  if (!br) {
    const e = new Error('Филиал не найден');
    e.code = 'NOT_FOUND';
    throw e;
  }

  const ingIds = [...new Set(parsed.map((p) => p.ingredientId))];
  const ingredients = await prisma.ingredient.findMany({
    where: { id: { in: ingIds } },
    select: {
      id: true,
      name: true,
      defaultUnitId: true,
      defaultUnit: { select: { code: true, displayName: true } }
    }
  });
  const ingById = new Map(ingredients.map((i) => [i.id, i]));
  for (const p of parsed) {
    const ing = ingById.get(p.ingredientId);
    if (!ing) {
      const e = new Error(`Ингредиент не найден: ${p.ingredientId}`);
      e.code = 'VALIDATION';
      throw e;
    }
    if (p.unitId !== ing.defaultUnitId) {
      const e = new Error(
        `Ингредиент ${ing.name}: unitId должен совпадать с defaultUnitId (v1 stock)`
      );
      e.code = 'VALIDATION';
      throw e;
    }
  }

  const balances = await buildStockBalancesForBranch(prisma, branchId);
  const balMap = new Map(balances.map((b) => [balanceKey(b.ingredientId, b.unitId), b.balance]));

  const batchRef = randomUUID();
  const occurredAt = new Date();

  /** @type {Array<{
   *   ingredientId: string,
   *   ingredientName: string,
   *   unitId: string,
   *   unitCode: string,
   *   unitDisplayName: string,
   *   systemBalanceQty: number,
   *   countedQty: number,
   *   differenceQty: number,
   *   movementType: 'ADJUSTMENT_IN' | 'ADJUSTMENT_OUT' | null,
   *   adjustmentQty: number | null
   * }>} */
  const lineResults = [];

  /** @type {Array<{ ingredientId: string, unitId: string, movementType: string, quantity: number, note: string }>} */
  const movements = [];

  for (const p of parsed) {
    const ing = ingById.get(p.ingredientId);
    const systemBal = Number(balMap.get(balanceKey(p.ingredientId, p.unitId)) ?? 0);
    const diff = p.countedQty - systemBal;

    const balRow = balances.find((b) => b.ingredientId === p.ingredientId && b.unitId === p.unitId);
    const unitCode = balRow?.unitCode ?? ing.defaultUnit?.code ?? '';
    const unitDisplayName = balRow?.unitDisplayName ?? ing.defaultUnit?.displayName ?? '';

    let movementType = null;
    let adjustmentQty = null;
    if (diff > EPS) {
      movementType = 'ADJUSTMENT_IN';
      adjustmentQty = diff;
    } else if (diff < -EPS) {
      movementType = 'ADJUSTMENT_OUT';
      adjustmentQty = Math.abs(diff);
    }

    lineResults.push({
      ingredientId: p.ingredientId,
      ingredientName: ing.name,
      unitId: p.unitId,
      unitCode,
      unitDisplayName,
      systemBalanceQty: systemBal,
      countedQty: p.countedQty,
      differenceQty: diff,
      movementType,
      adjustmentQty
    });

    if (movementType && adjustmentQty != null && adjustmentQty > EPS) {
      movementSignedQuantity(movementType, adjustmentQty);
      const base = `INVENTORY_RECONCILE branchId=${branchId} batchRef=${batchRef} ingredientId=${p.ingredientId}`;
      const note = userNote ? `${base} note=${userNote.replace(/\s+/g, ' ')}`.slice(0, 2000) : base.slice(0, 2000);
      movements.push({
        ingredientId: p.ingredientId,
        unitId: p.unitId,
        movementType,
        quantity: adjustmentQty,
        note
      });
    }
  }

  let adjustmentInCount = 0;
  let adjustmentOutCount = 0;
  for (const m of movements) {
    if (m.movementType === 'ADJUSTMENT_IN') adjustmentInCount += 1;
    if (m.movementType === 'ADJUSTMENT_OUT') adjustmentOutCount += 1;
  }

  const summary = {
    rowCount: lineResults.length,
    changedLineCount: movements.length,
    adjustmentInCount,
    adjustmentOutCount
  };

  if (!confirm) {
    return {
      preview: true,
      branchId,
      batchRef,
      occurredAt: occurredAt.toISOString(),
      lines: lineResults,
      movements,
      summary
    };
  }

  const { inventoryCountBatchId, createdMovementIds } = await prisma.$transaction(async (tx) => {
    const batch = await tx.inventoryCountBatch.create({
      data: {
        branchId,
        reconciledAt: occurredAt,
        note: userNote,
        rowCount: lineResults.length,
        changedLineCount: movements.length,
        adjustmentInCount,
        adjustmentOutCount
      }
    });

    const movementIdByKey = new Map();
    const createdIds = [];

    for (const m of movements) {
      const base = `INVENTORY_RECONCILE branchId=${branchId} batchId=${batch.id} ingredientId=${m.ingredientId}`;
      const note = userNote ? `${base} note=${userNote.replace(/\s+/g, ' ')}`.slice(0, 2000) : base.slice(0, 2000);
      const row = await tx.stockMovement.create({
        data: {
          branchId,
          ingredientId: m.ingredientId,
          unitId: m.unitId,
          movementType: m.movementType,
          quantity: new Prisma.Decimal(String(m.quantity)),
          occurredAt,
          note
        }
      });
      createdIds.push(row.id);
      movementIdByKey.set(balanceKey(m.ingredientId, m.unitId), row.id);
    }

    for (const lr of lineResults) {
      const smId = movementIdByKey.get(balanceKey(lr.ingredientId, lr.unitId)) ?? null;
      await tx.inventoryCountLine.create({
        data: {
          inventoryCountBatchId: batch.id,
          ingredientId: lr.ingredientId,
          unitId: lr.unitId,
          systemBalanceQty: new Prisma.Decimal(String(lr.systemBalanceQty)),
          countedQty: new Prisma.Decimal(String(lr.countedQty)),
          differenceQty: new Prisma.Decimal(String(lr.differenceQty)),
          movementType: lr.movementType,
          adjustmentQty:
            lr.adjustmentQty != null ? new Prisma.Decimal(String(lr.adjustmentQty)) : null,
          stockMovementId: smId
        }
      });
    }

    return { inventoryCountBatchId: batch.id, createdMovementIds: createdIds };
  });

  return {
    preview: false,
    branchId,
    batchRef,
    inventoryCountBatchId,
    occurredAt: occurredAt.toISOString(),
    createdMovementIds,
    summary: {
      ...summary,
      createdMovementCount: createdMovementIds.length
    }
  };
}
