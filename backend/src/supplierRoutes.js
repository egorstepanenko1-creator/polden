/**
 * Protected supplier API v1 — `/api/suppliers/*` (X-CRM-Token).
 */

import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { assertNoOverlappingSupplierOffers } from './supplierOffers.js';

function ok(data) {
  return { ok: true, data };
}
function fail(message, code = 'BAD_REQUEST') {
  return { ok: false, error: { message, code } };
}

function parseRequiredDate(value, field) {
  if (value == null || value === '') {
    throw new Error(`${field} обязателен (ISO-8601)`);
  }
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) {
    throw new Error(`${field}: неверная дата ISO-8601`);
  }
  return d;
}

function parseOptionalDate(value, field) {
  if (value == null || value === '') return null;
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) {
    throw new Error(`${field}: null или дата ISO-8601`);
  }
  return d;
}

function serializeSupplier(s) {
  return {
    id: s.id,
    name: s.name,
    isActive: s.isActive,
    note: s.note,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString()
  };
}

function serializeOffer(row) {
  return {
    id: row.id,
    supplierId: row.supplierId,
    ingredientId: row.ingredientId,
    ingredientName: row.ingredient?.name,
    unitId: row.unitId,
    unitCode: row.unit?.code,
    packQuantity: String(row.packQuantity),
    pricePerPackKopeks: row.pricePerPackKopeks,
    effectiveFrom: row.effectiveFrom.toISOString(),
    effectiveTo: row.effectiveTo ? row.effectiveTo.toISOString() : null,
    note: row.note,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 */
export function createSupplierRouter(prisma) {
  const r = Router();

  r.get('/', async (_req, res) => {
    try {
      const rows = await prisma.supplier.findMany({ orderBy: { name: 'asc' } });
      res.json(ok(rows.map(serializeSupplier)));
    } catch (e) {
      res.status(500).json(fail(e.message || 'list suppliers failed', 'INTERNAL'));
    }
  });

  r.post('/', async (req, res) => {
    const body = req.body || {};
    const name = body.name != null ? String(body.name).trim() : '';
    const note = body.note != null ? String(body.note).trim().slice(0, 2000) || null : null;
    const isActive = body.isActive === false ? false : true;
    if (!name || name.length > 200) {
      return res.status(400).json(fail('name обязателен (до 200 символов)', 'VALIDATION'));
    }
    try {
      const row = await prisma.supplier.create({
        data: { name, note, isActive }
      });
      res.status(201).json(ok(serializeSupplier(row)));
    } catch (e) {
      res.status(500).json(fail(e.message || 'create supplier failed', 'INTERNAL'));
    }
  });

  r.patch('/:supplierId', async (req, res) => {
    const supplierId = req.params.supplierId != null ? String(req.params.supplierId).trim() : '';
    if (!supplierId) {
      return res.status(400).json(fail('supplierId required', 'VALIDATION'));
    }
    const body = req.body || {};
    const data = {};
    if (body.name != null) {
      const name = String(body.name).trim();
      if (!name || name.length > 200) {
        return res.status(400).json(fail('name: пусто или длиннее 200 символов', 'VALIDATION'));
      }
      data.name = name;
    }
    if (body.note !== undefined) {
      data.note = body.note == null ? null : String(body.note).trim().slice(0, 2000) || null;
    }
    if (body.isActive !== undefined) {
      data.isActive = Boolean(body.isActive);
    }
    if (Object.keys(data).length === 0) {
      return res.status(400).json(fail('Нет полей для обновления', 'VALIDATION'));
    }
    try {
      const row = await prisma.supplier.update({
        where: { id: supplierId },
        data
      });
      res.json(ok(serializeSupplier(row)));
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
        return res.status(404).json(fail('Поставщик не найден', 'NOT_FOUND'));
      }
      res.status(500).json(fail(e.message || 'update supplier failed', 'INTERNAL'));
    }
  });

  r.get('/:supplierId/offers', async (req, res) => {
    const supplierId = String(req.params.supplierId || '').trim();
    if (!supplierId) {
      return res.status(400).json(fail('supplierId required', 'VALIDATION'));
    }
    try {
      const sup = await prisma.supplier.findUnique({ where: { id: supplierId } });
      if (!sup) {
        return res.status(404).json(fail('Поставщик не найден', 'NOT_FOUND'));
      }
      const rows = await prisma.supplierIngredientOffer.findMany({
        where: { supplierId },
        orderBy: [{ effectiveFrom: 'desc' }, { id: 'desc' }],
        include: {
          ingredient: { select: { name: true } },
          unit: { select: { code: true } }
        }
      });
      res.json(ok(rows.map(serializeOffer)));
    } catch (e) {
      res.status(500).json(fail(e.message || 'list offers failed', 'INTERNAL'));
    }
  });

  r.post('/:supplierId/offers', async (req, res) => {
    const supplierId = String(req.params.supplierId || '').trim();
    const body = req.body || {};
    const ingredientId = body.ingredientId != null ? String(body.ingredientId).trim() : '';
    const unitId = body.unitId != null ? String(body.unitId).trim() : '';
    const note = body.note != null ? String(body.note).trim().slice(0, 2000) || null : null;

    if (!supplierId || !ingredientId || !unitId) {
      return res.status(400).json(fail('supplierId (path), ingredientId и unitId обязательны', 'VALIDATION'));
    }

    const packQtyRaw = body.packQuantity;
    const packNum = Number(packQtyRaw);
    if (!Number.isFinite(packNum) || packNum <= 0) {
      return res.status(400).json(fail('packQuantity должно быть конечным числом > 0', 'VALIDATION'));
    }

    const priceRaw = body.pricePerPackKopeks;
    const priceNum = Number(priceRaw);
    if (!Number.isInteger(priceNum) || priceNum < 0) {
      return res.status(400).json(fail('pricePerPackKopeks: целое число ≥ 0', 'VALIDATION'));
    }

    let effectiveFrom;
    let effectiveTo;
    try {
      effectiveFrom = parseRequiredDate(body.effectiveFrom, 'effectiveFrom');
      effectiveTo = parseOptionalDate(body.effectiveTo, 'effectiveTo');
    } catch (err) {
      return res.status(400).json(fail(err.message, 'VALIDATION'));
    }
    if (effectiveTo != null && effectiveTo.getTime() <= effectiveFrom.getTime()) {
      return res.status(400).json(fail('effectiveTo должен быть позже effectiveFrom', 'VALIDATION'));
    }

    try {
      const [supplier, ingredient, unit] = await Promise.all([
        prisma.supplier.findUnique({ where: { id: supplierId } }),
        prisma.ingredient.findUnique({ where: { id: ingredientId } }),
        prisma.unit.findUnique({ where: { id: unitId } })
      ]);
      if (!supplier) {
        return res.status(404).json(fail('Поставщик не найден', 'NOT_FOUND'));
      }
      if (!ingredient) {
        return res.status(404).json(fail('Ингредиент не найден', 'NOT_FOUND'));
      }
      if (!unit) {
        return res.status(404).json(fail('Единица не найдена', 'NOT_FOUND'));
      }
      if (unitId !== ingredient.defaultUnitId) {
        return res.status(400).json(
          fail('unitId должен совпадать с ingredient.defaultUnitId (v1)', 'VALIDATION')
        );
      }

      await assertNoOverlappingSupplierOffers(prisma, {
        supplierId,
        ingredientId,
        unitId,
        effectiveFrom,
        effectiveTo,
        excludeOfferId: undefined
      });

      const row = await prisma.supplierIngredientOffer.create({
        data: {
          supplierId,
          ingredientId,
          unitId,
          packQuantity: new Prisma.Decimal(String(packNum)),
          pricePerPackKopeks: priceNum,
          effectiveFrom,
          effectiveTo,
          note
        },
        include: {
          ingredient: { select: { name: true } },
          unit: { select: { code: true } }
        }
      });
      res.status(201).json(ok(serializeOffer(row)));
    } catch (e) {
      if (e.code === 'VALIDATION') {
        return res.status(400).json(fail(e.message, 'VALIDATION'));
      }
      res.status(500).json(fail(e.message || 'create offer failed', 'INTERNAL'));
    }
  });

  return r;
}
