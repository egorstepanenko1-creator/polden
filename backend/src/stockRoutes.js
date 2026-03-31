/**
 * Protected stock API v1 — `/api/stock/*` (X-CRM-Token).
 */

import { Router } from 'express';
import { Prisma } from '@prisma/client';
import {
  buildStockBalancesForBranch,
  isValidMovementType,
  movementResponseFields,
  movementSignedQuantity
} from './stockMovement.js';
import {
  buildInventoryCountSheet,
  getInventoryCountBatchById,
  listInventoryCountBatches,
  processInventoryReconcile,
  serializeInventoryCountBatchDetail,
  serializeInventoryCountBatchListItem
} from './inventoryReconcile.js';

function ok(data) {
  return { ok: true, data };
}
function fail(message, code = 'BAD_REQUEST') {
  return { ok: false, error: { message, code } };
}

function serializeMovement(row) {
  const { signedQuantity } = movementResponseFields(row);
  return {
    id: row.id,
    branchId: row.branchId,
    ingredientId: row.ingredientId,
    ingredientName: row.ingredient.name,
    unitId: row.unitId,
    unitCode: row.unit.code,
    movementType: row.movementType,
    quantity: String(row.quantity),
    signedQuantity,
    occurredAt: row.occurredAt.toISOString(),
    note: row.note,
    createdAt: row.createdAt.toISOString()
  };
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 */
export function createStockRouter(prisma) {
  const r = Router();

  r.get('/inventory-count-sheet', async (req, res) => {
    const branchId = req.query.branchId;
    if (!branchId) {
      return res.status(400).json(fail('branchId required', 'VALIDATION'));
    }
    try {
      const b = await prisma.branch.findUnique({ where: { id: String(branchId) } });
      if (!b) {
        return res.status(404).json(fail('Branch not found', 'NOT_FOUND'));
      }
      const sheet = await buildInventoryCountSheet(prisma, String(branchId));
      res.json(ok(sheet));
    } catch (e) {
      res.status(500).json(fail(e.message || 'inventory count sheet failed', 'INTERNAL'));
    }
  });

  r.post('/inventory-reconcile', async (req, res) => {
    const body = req.body || {};
    try {
      const result = await processInventoryReconcile(prisma, {
        branchId: body.branchId,
        rows: body.rows,
        confirm: body.confirm === true,
        note: body.note
      });
      res.json(ok(result));
    } catch (e) {
      const code = e.code === 'NOT_FOUND' ? 'NOT_FOUND' : e.code === 'VALIDATION' ? 'VALIDATION' : 'INTERNAL';
      const status = code === 'NOT_FOUND' ? 404 : code === 'VALIDATION' ? 400 : 500;
      res.status(status).json(fail(e.message || 'inventory reconcile failed', code));
    }
  });

  r.get('/inventory-count-batches', async (req, res) => {
    const branchId = req.query.branchId;
    if (!branchId) {
      return res.status(400).json(fail('branchId required', 'VALIDATION'));
    }
    try {
      const b = await prisma.branch.findUnique({ where: { id: String(branchId) } });
      if (!b) {
        return res.status(404).json(fail('Branch not found', 'NOT_FOUND'));
      }
      const rows = await listInventoryCountBatches(prisma, String(branchId));
      res.json(ok(rows.map(serializeInventoryCountBatchListItem)));
    } catch (e) {
      res.status(500).json(fail(e.message || 'list inventory batches failed', 'INTERNAL'));
    }
  });

  r.get('/inventory-count-batches/:batchId', async (req, res) => {
    const batchId = req.params.batchId != null ? String(req.params.batchId).trim() : '';
    if (!batchId) {
      return res.status(400).json(fail('batchId required', 'VALIDATION'));
    }
    try {
      const batch = await getInventoryCountBatchById(prisma, batchId);
      if (!batch) {
        return res.status(404).json(fail('Inventory batch not found', 'NOT_FOUND'));
      }
      res.json(ok(serializeInventoryCountBatchDetail(batch)));
    } catch (e) {
      res.status(500).json(fail(e.message || 'get inventory batch failed', 'INTERNAL'));
    }
  });

  r.get('/balances', async (req, res) => {
    const branchId = req.query.branchId;
    if (!branchId) {
      return res.status(400).json(fail('branchId required'));
    }
    try {
      const b = await prisma.branch.findUnique({ where: { id: String(branchId) } });
      if (!b) {
        return res.status(404).json(fail('Branch not found', 'NOT_FOUND'));
      }
      const balances = await buildStockBalancesForBranch(prisma, String(branchId));
      res.json(ok({ branchId: String(branchId), balances }));
    } catch (e) {
      res.status(500).json(fail(e.message || 'balances failed', 'INTERNAL'));
    }
  });

  r.get('/movements', async (req, res) => {
    const branchId = req.query.branchId;
    if (!branchId) {
      return res.status(400).json(fail('branchId required'));
    }
    const ingredientId = req.query.ingredientId ? String(req.query.ingredientId) : undefined;
    let dateFrom = null;
    let dateTo = null;
    if (req.query.dateFrom) {
      dateFrom = new Date(String(req.query.dateFrom));
      if (Number.isNaN(dateFrom.getTime())) {
        return res.status(400).json(fail('dateFrom invalid ISO datetime'));
      }
    }
    if (req.query.dateTo) {
      dateTo = new Date(String(req.query.dateTo));
      if (Number.isNaN(dateTo.getTime())) {
        return res.status(400).json(fail('dateTo invalid ISO datetime'));
      }
    }

    const where = {
      branchId: String(branchId),
      ...(ingredientId ? { ingredientId } : {}),
      ...(dateFrom || dateTo
        ? {
            occurredAt: {
              ...(dateFrom ? { gte: dateFrom } : {}),
              ...(dateTo ? { lte: dateTo } : {})
            }
          }
        : {})
    };

    try {
      const b = await prisma.branch.findUnique({ where: { id: String(branchId) } });
      if (!b) {
        return res.status(404).json(fail('Branch not found', 'NOT_FOUND'));
      }
      const rows = await prisma.stockMovement.findMany({
        where,
        orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
        include: {
          ingredient: { select: { name: true } },
          unit: { select: { code: true } }
        }
      });
      res.json(ok(rows.map(serializeMovement)));
    } catch (e) {
      res.status(500).json(fail(e.message || 'list movements failed', 'INTERNAL'));
    }
  });

  r.post('/movements', async (req, res) => {
    const body = req.body || {};
    const branchId = body.branchId != null ? String(body.branchId).trim() : '';
    const ingredientId = body.ingredientId != null ? String(body.ingredientId).trim() : '';
    const unitId = body.unitId != null ? String(body.unitId).trim() : '';
    const movementType = body.movementType != null ? String(body.movementType).trim() : '';
    const note = body.note != null ? String(body.note).trim().slice(0, 2000) || null : null;

    if (!branchId || !ingredientId || !unitId || !movementType) {
      return res.status(400).json(fail('branchId, ingredientId, unitId, movementType required'));
    }
    if (!isValidMovementType(movementType)) {
      return res.status(400).json(
        fail(
          `movementType must be one of: OPENING_BALANCE, RECEIPT, ADJUSTMENT_IN, ADJUSTMENT_OUT, WASTE, PRODUCTION_CONSUMPTION`,
          'VALIDATION'
        )
      );
    }

    let occurredAt;
    if (body.occurredAt == null || body.occurredAt === '') {
      return res.status(400).json(fail('occurredAt required (ISO-8601)'));
    }
    occurredAt = new Date(String(body.occurredAt));
    if (Number.isNaN(occurredAt.getTime())) {
      return res.status(400).json(fail('occurredAt must be valid ISO-8601'));
    }

    const qtyRaw = body.quantity;
    if (qtyRaw == null || !Number.isFinite(Number(qtyRaw)) || Number(qtyRaw) <= 0) {
      return res.status(400).json(fail('quantity required (finite number > 0, magnitude only)'));
    }
    const qtyNum = Number(qtyRaw);

    try {
      movementSignedQuantity(movementType, qtyNum);
    } catch (e) {
      return res.status(400).json(fail(e.message || 'quantity invalid', 'VALIDATION'));
    }

    try {
      const [br, ing, unit] = await Promise.all([
        prisma.branch.findUnique({ where: { id: branchId } }),
        prisma.ingredient.findUnique({ where: { id: ingredientId } }),
        prisma.unit.findUnique({ where: { id: unitId } })
      ]);
      if (!br) {
        return res.status(404).json(fail('Branch not found', 'NOT_FOUND'));
      }
      if (!ing) {
        return res.status(404).json(fail('Ingredient not found', 'NOT_FOUND'));
      }
      if (!unit) {
        return res.status(404).json(fail('Unit not found', 'NOT_FOUND'));
      }
      if (unitId !== ing.defaultUnitId) {
        return res.status(400).json(
          fail('unitId must equal ingredient.defaultUnitId (v1 stock)', 'VALIDATION')
        );
      }

      const row = await prisma.stockMovement.create({
        data: {
          branchId,
          ingredientId,
          unitId,
          movementType,
          quantity: new Prisma.Decimal(String(qtyNum)),
          occurredAt,
          note
        },
        include: {
          ingredient: { select: { name: true } },
          unit: { select: { code: true } }
        }
      });

      res.status(201).json(ok(serializeMovement(row)));
    } catch (e) {
      res.status(500).json(fail(e.message || 'create movement failed', 'INTERNAL'));
    }
  });

  return r;
}
