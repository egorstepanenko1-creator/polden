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


  // POST /api/stock/receipt — поставка: записывает RECEIPT-движения + пересчитывает AVCO цену ингредиента
  // Body: { branchId, items: [{ingredientId, unitId, quantity, pricePerUnitKopeks}], occurredAt?, note? }
  r.post('/receipt', async (req, res) => {
    const body = req.body || {};
    const branchId = body.branchId != null ? String(body.branchId).trim() : '';
    if (!branchId) return res.status(400).json(fail('branchId required'));

    const items = Array.isArray(body.items) ? body.items : [];
    if (items.length === 0) return res.status(400).json(fail('items[] required'));

    let occurredAt = new Date();
    if (body.occurredAt) {
      occurredAt = new Date(String(body.occurredAt));
      if (Number.isNaN(occurredAt.getTime())) return res.status(400).json(fail('occurredAt invalid'));
    }
    const note = body.note != null ? String(body.note).slice(0, 2000) || null : null;

    try {
      const br = await prisma.branch.findUnique({ where: { id: branchId } });
      if (!br) return res.status(404).json(fail('Branch not found', 'NOT_FOUND'));

      // Validate all items first
      for (const item of items) {
        const ingId = item.ingredientId != null ? String(item.ingredientId).trim() : '';
        const unitId = item.unitId != null ? String(item.unitId).trim() : '';
        const qty = Number(item.quantity);
        const price = Number(item.pricePerUnitKopeks);
        if (!ingId || !unitId) return res.status(400).json(fail('each item needs ingredientId, unitId'));
        if (!Number.isFinite(qty) || qty <= 0) return res.status(400).json(fail('quantity must be > 0'));
        if (!Number.isFinite(price) || price < 0) return res.status(400).json(fail('pricePerUnitKopeks must be >= 0'));
        const ing = await prisma.ingredient.findUnique({ where: { id: ingId } });
        if (!ing) return res.status(404).json(fail('Ingredient ' + ingId + ' not found', 'NOT_FOUND'));
        if (unitId !== ing.defaultUnitId) return res.status(400).json(fail('unitId must equal ingredient.defaultUnitId for ' + ingId));
      }

      const results = [];
      for (const item of items) {
        const ingId = String(item.ingredientId).trim();
        const unitId = String(item.unitId).trim();
        const recvQty = Number(item.quantity);
        const recvPrice = Math.floor(Number(item.pricePerUnitKopeks));

        // 1. Get current stock balance
        const allMovements = await prisma.stockMovement.findMany({
          where: { branchId, ingredientId: ingId }
        });
        let curBalance = 0;
        for (const m of allMovements) {
          curBalance += movementSignedQuantity(m.movementType, Number(m.quantity));
        }

        // 2. Get current price (most recent IngredientPrice with effectiveTo = null)
        const curPriceRow = await prisma.ingredientPrice.findFirst({
          where: { ingredientId: ingId, unitId, effectiveTo: null },
          orderBy: { effectiveFrom: 'desc' }
        });
        const curPrice = curPriceRow ? curPriceRow.pricePerUnitKopeks : 0;

        // 3. AVCO = (curBalance * curPrice + recvQty * recvPrice) / (curBalance + recvQty)
        const avcoBalance = Math.max(curBalance, 0);
        const newAvco = avcoBalance + recvQty > 0
          ? Math.round((avcoBalance * curPrice + recvQty * recvPrice) / (avcoBalance + recvQty))
          : recvPrice;

        // 4. Create RECEIPT StockMovement
        const movement = await prisma.stockMovement.create({
          data: {
            branchId,
            ingredientId: ingId,
            unitId,
            movementType: 'RECEIPT',
            quantity: new Prisma.Decimal(String(recvQty)),
            occurredAt,
            note
          },
          include: { ingredient: { select: { name: true } }, unit: { select: { code: true } } }
        });

        // 5. Update IngredientPrice: close current open row, create new with AVCO
        if (curPriceRow) {
          await prisma.ingredientPrice.update({
            where: { id: curPriceRow.id },
            data: { effectiveTo: occurredAt }
          });
        }
        await prisma.ingredientPrice.create({
          data: {
            ingredientId: ingId,
            unitId,
            pricePerUnitKopeks: newAvco,
            effectiveFrom: occurredAt,
            effectiveTo: null
          }
        });

        results.push({
          ingredientId: ingId,
          ingredientName: movement.ingredient.name,
          quantity: recvQty,
          unitCode: movement.unit.code,
          priceKopeks: recvPrice,
          newAvcoKopeks: newAvco,
          movementId: movement.id
        });
      }

      res.status(201).json(ok({ branchId, occurredAt: occurredAt.toISOString(), items: results }));
    } catch (e) {
      res.status(500).json(fail(e.message || 'receipt failed', 'INTERNAL'));
    }
  });

  return r;
}
