/**
 * Protected Kitchen Catalog API v1 — `/api/kitchen/*` (requires X-CRM-Token).
 * See docs/KITCHEN_CATALOG_API_V1.md
 */

import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { foodCostKopeks } from './foodCost.js';

function ok(data) {
  return { ok: true, data };
}
function fail(message, code = 'BAD_REQUEST') {
  return { ok: false, error: { message, code } };
}

/** Half-open [from, to): overlap iff fromA < endB && fromB < endA (null to = +∞). */
export function ingredientPriceIntervalsOverlap(fromA, toA, fromB, toB) {
  const aStart = fromA.getTime();
  const bStart = fromB.getTime();
  const aEnd = toA ? toA.getTime() : Infinity;
  const bEnd = toB ? toB.getTime() : Infinity;
  return aStart < bEnd && bStart < aEnd;
}

function parseRequiredDate(value, field) {
  if (value == null || value === '') {
    throw new Error(`${field} is required (ISO-8601)`);
  }
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) {
    throw new Error(`${field} must be a valid ISO-8601 datetime`);
  }
  return d;
}

function parseOptionalDate(value, field) {
  if (value == null || value === '') return null;
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) {
    throw new Error(`${field} must be null or valid ISO-8601 datetime`);
  }
  return d;
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 */
export function createKitchenCatalogRouter(prisma) {
  const r = Router();

  // --- Units ---
  r.get('/units', async (_req, res) => {
    try {
      const rows = await prisma.unit.findMany({ orderBy: { code: 'asc' } });
      res.json(ok(rows.map((u) => ({ id: u.id, code: u.code, displayName: u.displayName }))));
    } catch (e) {
      res.status(500).json(fail(e.message || 'list units failed', 'INTERNAL'));
    }
  });

  r.post('/units', async (req, res) => {
    const body = req.body || {};
    const code = body.code != null ? String(body.code).trim() : '';
    const displayName = body.displayName != null ? String(body.displayName).trim() : '';
    if (!code || code.length > 64) {
      return res.status(400).json(fail('code required (max 64 chars)', 'VALIDATION'));
    }
    if (!displayName || displayName.length > 200) {
      return res.status(400).json(fail('displayName required (max 200 chars)', 'VALIDATION'));
    }
    try {
      const row = await prisma.unit.create({
        data: { code, displayName }
      });
      res.status(201).json(ok({ id: row.id, code: row.code, displayName: row.displayName }));
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        return res.status(409).json(fail('Unit code already exists', 'DUPLICATE'));
      }
      res.status(500).json(fail(e.message || 'create unit failed', 'INTERNAL'));
    }
  });

  // --- Ingredients ---
  r.get('/ingredients', async (_req, res) => {
    try {
      const rows = await prisma.ingredient.findMany({
        where: { active: true },
        orderBy: { name: 'asc' },
        include: { defaultUnit: true }
      });
      res.json(
        ok(
          rows.map((ing) => ({
            id: ing.id,
            name: ing.name,
            sku: ing.sku,
            active: ing.active,
            defaultUnitId: ing.defaultUnitId,
            defaultUnit: { id: ing.defaultUnit.id, code: ing.defaultUnit.code, displayName: ing.defaultUnit.displayName }
          }))
        )
      );
    } catch (e) {
      res.status(500).json(fail(e.message || 'list ingredients failed', 'INTERNAL'));
    }
  });

  r.post('/ingredients', async (req, res) => {
    const body = req.body || {};
    const name = body.name != null ? String(body.name).trim() : '';
    const defaultUnitId = body.defaultUnitId != null ? String(body.defaultUnitId).trim() : '';
    if (!name || name.length > 200) {
      return res.status(400).json(fail('name required (max 200 chars)', 'VALIDATION'));
    }
    if (!defaultUnitId) {
      return res.status(400).json(fail('defaultUnitId required', 'VALIDATION'));
    }
    const sku = body.sku != null ? String(body.sku).trim().slice(0, 64) || null : null;
    const active = body.active === false ? false : true;
    try {
      const unit = await prisma.unit.findUnique({ where: { id: defaultUnitId } });
      if (!unit) {
        return res.status(400).json(fail('defaultUnitId not found', 'VALIDATION'));
      }
      const row = await prisma.ingredient.create({
        data: { name, defaultUnitId, sku, active },
        include: { defaultUnit: true }
      });
      res.status(201).json(
        ok({
          id: row.id,
          name: row.name,
          sku: row.sku,
          active: row.active,
          defaultUnitId: row.defaultUnitId,
          defaultUnit: {
            id: row.defaultUnit.id,
            code: row.defaultUnit.code,
            displayName: row.defaultUnit.displayName
          }
        })
      );
    } catch (e) {
      res.status(500).json(fail(e.message || 'create ingredient failed', 'INTERNAL'));
    }
  });

  r.patch('/ingredients/:ingredientId', async (req, res) => {
    const { ingredientId } = req.params;
    const body = req.body || {};
    const data = {};
    if (body.name != null) {
      const name = String(body.name).trim();
      if (!name || name.length > 200) {
        return res.status(400).json(fail('name invalid', 'VALIDATION'));
      }
      data.name = name;
    }
    if (body.sku !== undefined) {
      data.sku = body.sku == null || body.sku === '' ? null : String(body.sku).trim().slice(0, 64);
    }
    if (body.active !== undefined) {
      data.active = Boolean(body.active);
    }
    if (body.defaultUnitId != null) {
      const uid = String(body.defaultUnitId).trim();
      const unit = await prisma.unit.findUnique({ where: { id: uid } });
      if (!unit) {
        return res.status(400).json(fail('defaultUnitId not found', 'VALIDATION'));
      }
      data.defaultUnitId = uid;
    }
    if (Object.keys(data).length === 0) {
      return res.status(400).json(fail('no fields to update', 'VALIDATION'));
    }
    try {
      const row = await prisma.ingredient.update({
        where: { id: String(ingredientId) },
        data,
        include: { defaultUnit: true }
      });
      res.json(
        ok({
          id: row.id,
          name: row.name,
          sku: row.sku,
          active: row.active,
          defaultUnitId: row.defaultUnitId,
          defaultUnit: {
            id: row.defaultUnit.id,
            code: row.defaultUnit.code,
            displayName: row.defaultUnit.displayName
          }
        })
      );
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
        return res.status(404).json(fail('Ingredient not found', 'NOT_FOUND'));
      }
      res.status(500).json(fail(e.message || 'update ingredient failed', 'INTERNAL'));
    }
  });

  // --- Ingredient prices (register before generic :id routes if any) ---
  r.get('/ingredients/:ingredientId/prices', async (req, res) => {
    const { ingredientId } = req.params;
    try {
      const ing = await prisma.ingredient.findUnique({ where: { id: String(ingredientId) } });
      if (!ing) {
        return res.status(404).json(fail('Ingredient not found', 'NOT_FOUND'));
      }
      const rows = await prisma.ingredientPrice.findMany({
        where: { ingredientId: String(ingredientId) },
        orderBy: [{ unitId: 'asc' }, { effectiveFrom: 'asc' }],
        include: { unit: true }
      });
      res.json(
        ok(
          rows.map((p) => ({
            id: p.id,
            ingredientId: p.ingredientId,
            unitId: p.unitId,
            unit: { id: p.unit.id, code: p.unit.code, displayName: p.unit.displayName },
            pricePerUnitKopeks: p.pricePerUnitKopeks,
            effectiveFrom: p.effectiveFrom.toISOString(),
            effectiveTo: p.effectiveTo ? p.effectiveTo.toISOString() : null
          }))
        )
      );
    } catch (e) {
      res.status(500).json(fail(e.message || 'list prices failed', 'INTERNAL'));
    }
  });

  r.post('/ingredients/:ingredientId/prices', async (req, res) => {
    const { ingredientId } = req.params;
    const body = req.body || {};
    let effectiveFrom;
    let effectiveTo;
    try {
      effectiveFrom = parseRequiredDate(body.effectiveFrom, 'effectiveFrom');
      effectiveTo = parseOptionalDate(body.effectiveTo, 'effectiveTo');
    } catch (err) {
      return res.status(400).json(fail(err.message, 'VALIDATION'));
    }
    if (effectiveTo != null && effectiveTo.getTime() <= effectiveFrom.getTime()) {
      return res.status(400).json(fail('effectiveTo must be null or strictly after effectiveFrom', 'VALIDATION'));
    }
    const unitId = body.unitId != null ? String(body.unitId).trim() : '';
    if (!unitId) {
      return res.status(400).json(fail('unitId required', 'VALIDATION'));
    }
    const priceRaw = body.pricePerUnitKopeks;
    if (priceRaw == null || !Number.isFinite(Number(priceRaw)) || Number(priceRaw) < 0) {
      return res.status(400).json(fail('pricePerUnitKopeks required (integer kopeks, >= 0)', 'VALIDATION'));
    }
    const pricePerUnitKopeks = Math.floor(Number(priceRaw));

    try {
      const ing = await prisma.ingredient.findUnique({ where: { id: String(ingredientId) } });
      if (!ing) {
        return res.status(404).json(fail('Ingredient not found', 'NOT_FOUND'));
      }
      if (unitId !== ing.defaultUnitId) {
        return res.status(400).json(
          fail(
            'unitId must equal ingredient defaultUnitId (v1 costing has no unit conversion)',
            'VALIDATION'
          )
        );
      }
      const unit = await prisma.unit.findUnique({ where: { id: unitId } });
      if (!unit) {
        return res.status(400).json(fail('unitId not found', 'VALIDATION'));
      }

      const existing = await prisma.ingredientPrice.findMany({
        where: { ingredientId: String(ingredientId), unitId }
      });
      for (const ex of existing) {
        if (ingredientPriceIntervalsOverlap(effectiveFrom, effectiveTo, ex.effectiveFrom, ex.effectiveTo)) {
          return res.status(409).json(
            fail(
              `Price interval overlaps existing row ${ex.id} for this ingredient+unit (v1: no overlapping intervals)`,
              'PRICE_OVERLAP'
            )
          );
        }
      }

      const row = await prisma.ingredientPrice.create({
        data: {
          ingredientId: String(ingredientId),
          unitId,
          pricePerUnitKopeks,
          effectiveFrom,
          effectiveTo
        },
        include: { unit: true }
      });
      res.status(201).json(
        ok({
          id: row.id,
          ingredientId: row.ingredientId,
          unitId: row.unitId,
          unit: { id: row.unit.id, code: row.unit.code, displayName: row.unit.displayName },
          pricePerUnitKopeks: row.pricePerUnitKopeks,
          effectiveFrom: row.effectiveFrom.toISOString(),
          effectiveTo: row.effectiveTo ? row.effectiveTo.toISOString() : null
        })
      );
    } catch (e) {
      res.status(500).json(fail(e.message || 'create price failed', 'INTERNAL'));
    }
  });

  // PUT /ingredients/:ingredientId/price — установить/обновить текущую цену (без интервалов)
  r.put('/ingredients/:ingredientId/price', async (req, res) => {
    const { ingredientId } = req.params;
    const { pricePerUnitKopeks } = req.body || {};
    const kopeks = Math.floor(Number(pricePerUnitKopeks));
    if (!Number.isFinite(kopeks) || kopeks < 0) {
      return res.status(400).json(fail('pricePerUnitKopeks required (integer kopeks >= 0)', 'VALIDATION'));
    }
    try {
      const ing = await prisma.ingredient.findUnique({ where: { id: String(ingredientId) } });
      if (!ing) return res.status(404).json(fail('Ingredient not found', 'NOT_FOUND'));
      const unitId = ing.defaultUnitId;
      const now = new Date();
      // Find open price row
      const open = await prisma.ingredientPrice.findFirst({
        where: { ingredientId: String(ingredientId), unitId, effectiveTo: null },
        orderBy: { effectiveFrom: 'desc' }
      });
      if (open) {
        // Update in place
        await prisma.ingredientPrice.update({
          where: { id: open.id },
          data: { pricePerUnitKopeks: kopeks }
        });
      } else {
        await prisma.ingredientPrice.create({
          data: { ingredientId: String(ingredientId), unitId, pricePerUnitKopeks: kopeks, effectiveFrom: now, effectiveTo: null }
        });
      }
      res.json(ok({ ingredientId: String(ingredientId), unitId, pricePerUnitKopeks: kopeks }));
    } catch (e) {
      res.status(500).json(fail(e.message || 'set price failed', 'INTERNAL'));
    }
  });

  // --- Dishes ---
  r.get('/dishes', async (_req, res) => {
    try {
      const rows = await prisma.dish.findMany({
        orderBy: { name: 'asc' },
        include: { _count: { select: { versions: true } } }
      });
      res.json(
        ok(
          rows.map((d) => ({
            id: d.id,
            name: d.name,
            active: d.active,
            category: d.category,
            salePrice: d.salePrice,
            versionCount: d._count.versions
          }))
        )
      );
    } catch (e) {
      res.status(500).json(fail(e.message || 'list dishes failed', 'INTERNAL'));
    }
  });

  r.post('/dishes', async (req, res) => {
    const body = req.body || {};
    const name = body.name != null ? String(body.name).trim() : '';
    if (!name || name.length > 200) {
      return res.status(400).json(fail('name required (max 200 chars)', 'VALIDATION'));
    }
    const category = body.category != null ? String(body.category).trim().slice(0, 100) || null : null;
    const active = body.active === false ? false : true;
    const salePrice = body.salePrice != null && Number.isFinite(Number(body.salePrice)) ? Math.floor(Number(body.salePrice)) : null;
    try {
      const row = await prisma.dish.create({ data: { name, category, active, ...(salePrice != null ? { salePrice } : {}) } });
      res.status(201).json(ok({ id: row.id, name: row.name, active: row.active, category: row.category, salePrice: row.salePrice }));
    } catch (e) {
      res.status(500).json(fail(e.message || 'create dish failed', 'INTERNAL'));
    }
  });

  r.patch('/dishes/:dishId', async (req, res) => {
    const { dishId } = req.params;
    const body = req.body || {};
    const data = {};
    if (body.name != null) {
      const name = String(body.name).trim();
      if (!name || name.length > 200) {
        return res.status(400).json(fail('name invalid', 'VALIDATION'));
      }
      data.name = name;
    }
    if (body.category !== undefined) {
      data.category = body.category == null || body.category === '' ? null : String(body.category).trim().slice(0, 100);
    }
    if (body.active !== undefined) {
      data.active = Boolean(body.active);
    }
    if (body.salePrice !== undefined) {
      data.salePrice = body.salePrice == null ? null : (Number.isFinite(Number(body.salePrice)) ? Math.floor(Number(body.salePrice)) : undefined);
    }
    if (Object.keys(data).length === 0) {
      return res.status(400).json(fail('no fields to update', 'VALIDATION'));
    }
    try {
      const row = await prisma.dish.update({
        where: { id: String(dishId) },
        data
      });
      res.json(ok({ id: row.id, name: row.name, active: row.active, category: row.category, salePrice: row.salePrice }));
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
        return res.status(404).json(fail('Dish not found', 'NOT_FOUND'));
      }
      res.status(500).json(fail(e.message || 'update dish failed', 'INTERNAL'));
    }
  });

  r.delete('/dishes/:dishId', async (req, res) => {
    const { dishId } = req.params;
    try {
      const dish = await prisma.dish.findUnique({ where: { id: String(dishId) } });
      if (!dish) return res.status(404).json(fail('Dish not found', 'NOT_FOUND'));
      // Soft delete — деактивируем
      await prisma.dish.update({ where: { id: String(dishId) }, data: { active: false } });
      res.json(ok({ id: String(dishId), active: false }));
    } catch (e) {
      res.status(500).json(fail(e.message || 'delete dish failed', 'INTERNAL'));
    }
  });

  r.get('/dishes/:dishId/versions', async (req, res) => {
    const { dishId } = req.params;
    try {
      const dish = await prisma.dish.findUnique({ where: { id: String(dishId) } });
      if (!dish) {
        return res.status(404).json(fail('Dish not found', 'NOT_FOUND'));
      }
      const rows = await prisma.dishVersion.findMany({
        where: { dishId: String(dishId) },
        orderBy: { versionNumber: 'asc' },
        include: { _count: { select: { lines: true } } }
      });
      res.json(
        ok(
          rows.map((v) => ({
            id: v.id,
            dishId: v.dishId,
            versionNumber: v.versionNumber,
            status: v.status,
            notes: v.notes,
            createdAt: v.createdAt.toISOString(),
            lineCount: v._count.lines
          }))
        )
      );
    } catch (e) {
      res.status(500).json(fail(e.message || 'list versions failed', 'INTERNAL'));
    }
  });

  r.post('/dishes/:dishId/versions', async (req, res) => {
    const { dishId } = req.params;
    const body = req.body || {};
    const notes = body.notes != null ? String(body.notes).trim().slice(0, 2000) || null : null;
    try {
      const dish = await prisma.dish.findUnique({ where: { id: String(dishId) } });
      if (!dish) {
        return res.status(404).json(fail('Dish not found', 'NOT_FOUND'));
      }
      const agg = await prisma.dishVersion.aggregate({
        where: { dishId: String(dishId) },
        _max: { versionNumber: true }
      });
      const nextNum = (agg._max.versionNumber ?? 0) + 1;
      const row = await prisma.dishVersion.create({
        data: {
          dishId: String(dishId),
          versionNumber: nextNum,
          status: 'draft',
          notes
        }
      });
      res.status(201).json(
        ok({
          id: row.id,
          dishId: row.dishId,
          versionNumber: row.versionNumber,
          status: row.status,
          notes: row.notes,
          createdAt: row.createdAt.toISOString()
        })
      );
    } catch (e) {
      res.status(500).json(fail(e.message || 'create version failed', 'INTERNAL'));
    }
  });

  function serializeDishVersionDetail(v) {
    return {
      id: v.id,
      dishId: v.dishId,
      versionNumber: v.versionNumber,
      status: v.status,
      notes: v.notes,
      createdAt: v.createdAt.toISOString(),
      lines: v.lines.map((line) => ({
        id: line.id,
        ingredientId: line.ingredientId,
        ingredientName: line.ingredient.name,
        quantity: String(line.quantity),
        unitId: line.unitId,
        unitCode: line.unit.code
      }))
    };
  }

  r.get('/dish-versions/:versionId', async (req, res) => {
    const { versionId } = req.params;
    try {
      const v = await prisma.dishVersion.findUnique({
        where: { id: String(versionId) },
        include: {
          lines: {
            orderBy: { id: 'asc' },
            include: { ingredient: true, unit: true }
          }
        }
      });
      if (!v) {
        return res.status(404).json(fail('DishVersion not found', 'NOT_FOUND'));
      }
      res.json(ok(serializeDishVersionDetail(v)));
    } catch (e) {
      res.status(500).json(fail(e.message || 'get version failed', 'INTERNAL'));
    }
  });

  r.put('/dish-versions/:versionId/ingredients', async (req, res) => {
    const { versionId } = req.params;
    const body = req.body || {};
    const linesIn = body.lines;
    if (!Array.isArray(linesIn)) {
      return res.status(400).json(fail('body.lines must be an array', 'VALIDATION'));
    }

    try {
      const version = await prisma.dishVersion.findUnique({
        where: { id: String(versionId) },
        include: { lines: true }
      });
      if (!version) {
        return res.status(404).json(fail('DishVersion not found', 'NOT_FOUND'));
      }
      if (version.status !== 'draft') {
        return res.status(400).json(
          fail('Can only replace ingredients on draft versions', 'KITCHEN_VERSION_NOT_DRAFT')
        );
      }

      const toCreate = [];
      for (let i = 0; i < linesIn.length; i++) {
        const line = linesIn[i] || {};
        const ingredientId = line.ingredientId != null ? String(line.ingredientId).trim() : '';
        const unitId = line.unitId != null ? String(line.unitId).trim() : '';
        const qtyRaw = line.quantity;
        const q = Number(qtyRaw);
        if (!ingredientId) {
          return res.status(400).json(fail(`lines[${i}].ingredientId required`, 'VALIDATION'));
        }
        if (!unitId) {
          return res.status(400).json(fail(`lines[${i}].unitId required`, 'VALIDATION'));
        }
        if (!Number.isFinite(q) || q <= 0) {
          return res.status(400).json(fail(`lines[${i}].quantity must be a positive number`, 'VALIDATION'));
        }
        const ing = await prisma.ingredient.findUnique({ where: { id: ingredientId } });
        if (!ing) {
          return res.status(400).json(fail(`lines[${i}]: ingredient not found`, 'VALIDATION'));
        }
        if (unitId !== ing.defaultUnitId) {
          return res.status(400).json(
            fail(
              `lines[${i}]: unitId must equal ingredient defaultUnitId (v1 food cost rule)`,
              'VALIDATION'
            )
          );
        }
        const unit = await prisma.unit.findUnique({ where: { id: unitId } });
        if (!unit) {
          return res.status(400).json(fail(`lines[${i}]: unit not found`, 'VALIDATION'));
        }
        toCreate.push({
          dishVersionId: String(versionId),
          ingredientId,
          unitId,
          quantity: new Prisma.Decimal(String(q))
        });
      }

      const updated = await prisma.$transaction(async (tx) => {
        await tx.dishIngredient.deleteMany({ where: { dishVersionId: String(versionId) } });
        if (toCreate.length) {
          await tx.dishIngredient.createMany({ data: toCreate });
        }
        return tx.dishVersion.findUnique({
          where: { id: String(versionId) },
          include: {
            lines: {
              orderBy: { id: 'asc' },
              include: { ingredient: true, unit: true }
            }
          }
        });
      });

      res.json(ok(serializeDishVersionDetail(updated)));
    } catch (e) {
      res.status(500).json(fail(e.message || 'replace ingredients failed', 'INTERNAL'));
    }
  });

  r.post('/dish-versions/:versionId/publish', async (req, res) => {
    const { versionId } = req.params;
    const at = new Date();
    try {
      const version = await prisma.dishVersion.findUnique({
        where: { id: String(versionId) },
        include: { lines: true }
      });
      if (!version) {
        return res.status(404).json(fail('DishVersion not found', 'NOT_FOUND'));
      }
      if (version.status === 'published') {
        return res.status(400).json(fail('Version is already published', 'KITCHEN_ALREADY_PUBLISHED'));
      }
      if (version.status !== 'draft') {
        return res.status(400).json(fail('Only draft versions can be published', 'VALIDATION'));
      }
      if (version.lines.length === 0) {
        return res.status(400).json(fail('Cannot publish: composition is empty', 'KITCHEN_EMPTY_COMPOSITION'));
      }

      let totalKopeks;
      try {
        totalKopeks = await foodCostKopeks(prisma, String(versionId), at);
      } catch (e) {
        return res
          .status(400)
          .json(fail(e.message || 'Food cost cannot be computed for publish', 'FOOD_COST_ERROR'));
      }

      const row = await prisma.dishVersion.update({
        where: { id: String(versionId) },
        data: { status: 'published' },
        include: {
          lines: {
            orderBy: { id: 'asc' },
            include: { ingredient: true, unit: true }
          }
        }
      });

      res.json(
        ok({
          ...serializeDishVersionDetail(row),
          publishedFoodCostKopeks: totalKopeks,
          publishedAt: at.toISOString()
        })
      );
    } catch (e) {
      res.status(500).json(fail(e.message || 'publish failed', 'INTERNAL'));
    }
  });

  return r;
}
