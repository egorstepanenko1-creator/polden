/**
 * Protected Purchase Draft v1 — `/api/purchase-drafts/*` (X-CRM-Token).
 */

import { Router } from 'express';
import { Prisma } from '@prisma/client';
import {
  generatePurchaseDraft,
  serializePurchaseDraft,
  serializePurchaseDraftListItem
} from './purchaseDraftService.js';
import { processPurchaseDraftReceive } from './purchaseDraftReceive.js';

function ok(data) {
  return { ok: true, data };
}
function fail(message, code = 'BAD_REQUEST') {
  return { ok: false, error: { message, code } };
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 */
export function createPurchaseDraftRouter(prisma) {
  const r = Router();

  r.post('/generate', async (req, res) => {
    const body = req.body || {};
    const branchId = body.branchId != null ? String(body.branchId).trim() : '';
    const date = body.date != null ? String(body.date).trim() : '';
    let at = new Date();
    if (body.at != null && String(body.at).trim() !== '') {
      const d = new Date(String(body.at));
      if (Number.isNaN(d.getTime())) {
        return res.status(400).json(fail('at: неверная дата ISO-8601', 'VALIDATION'));
      }
      at = d;
    }
    const note = body.note !== undefined ? body.note : null;

    if (!branchId || !date) {
      return res.status(400).json(fail('branchId и date обязательны', 'VALIDATION'));
    }

    try {
      const draft = await generatePurchaseDraft(prisma, { branchId, date, at, note });
      res.status(201).json(ok(serializePurchaseDraft(draft)));
    } catch (e) {
      const code = e.code === 'NOT_FOUND' ? 'NOT_FOUND' : e.code === 'VALIDATION' ? 'VALIDATION' : 'INTERNAL';
      const status = code === 'NOT_FOUND' ? 404 : code === 'VALIDATION' ? 400 : 500;
      res.status(status).json(fail(e.message || 'generate draft failed', code));
    }
  });

  r.get('/', async (req, res) => {
    const branchId = req.query.branchId != null ? String(req.query.branchId).trim() : '';
    const date = req.query.date != null ? String(req.query.date).trim() : '';
    if (!branchId && !date) {
      return res.status(400).json(fail('Укажите branchId и/или date (query)', 'VALIDATION'));
    }
    /** @type {import('@prisma/client').Prisma.PurchaseDraftWhereInput} */
    const where = {};
    if (branchId) where.branchId = branchId;
    if (date) where.date = date;
    try {
      const rows = await prisma.purchaseDraft.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 300,
        include: {
          branch: { select: { name: true } },
          _count: { select: { lines: true } }
        }
      });
      res.json(ok(rows.map(serializePurchaseDraftListItem)));
    } catch (e) {
      res.status(500).json(fail(e.message || 'list drafts failed', 'INTERNAL'));
    }
  });

  r.post('/:draftId/receive', async (req, res) => {
    const draftId = String(req.params.draftId || '').trim();
    const body = req.body || {};
    if (!draftId) {
      return res.status(400).json(fail('draftId required', 'VALIDATION'));
    }
    try {
      const result = await processPurchaseDraftReceive(prisma, draftId, {
        lines: body.lines,
        confirm: body.confirm === true
      });
      if (result.preview) {
        return res.json(ok(result));
      }
      res.json(
        ok({
          ...result,
          draft: serializePurchaseDraft(result.draft)
        })
      );
    } catch (e) {
      const code = e.code === 'NOT_FOUND' ? 'NOT_FOUND' : e.code === 'VALIDATION' ? 'VALIDATION' : 'INTERNAL';
      const status = code === 'NOT_FOUND' ? 404 : code === 'VALIDATION' ? 400 : 500;
      res.status(status).json(fail(e.message || 'receive failed', code));
    }
  });

  r.get('/:draftId', async (req, res) => {
    const draftId = req.params.draftId != null ? String(req.params.draftId).trim() : '';
    if (!draftId) {
      return res.status(400).json(fail('draftId required', 'VALIDATION'));
    }
    try {
      const draft = await prisma.purchaseDraft.findUnique({
        where: { id: draftId },
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
      if (!draft) {
        return res.status(404).json(fail('Черновик не найден', 'NOT_FOUND'));
      }
      res.json(ok(serializePurchaseDraft(draft)));
    } catch (e) {
      res.status(500).json(fail(e.message || 'get draft failed', 'INTERNAL'));
    }
  });

  r.patch('/:draftId', async (req, res) => {
    const draftId = String(req.params.draftId || '').trim();
    const body = req.body || {};
    if (!draftId) {
      return res.status(400).json(fail('draftId required', 'VALIDATION'));
    }
    if (body.note === undefined) {
      return res.status(400).json(fail('Укажите note для обновления', 'VALIDATION'));
    }
    const note = body.note == null ? null : String(body.note).trim().slice(0, 2000) || null;
    try {
      const draft = await prisma.purchaseDraft.update({
        where: { id: draftId },
        data: { note },
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
      res.json(ok(serializePurchaseDraft(draft)));
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
        return res.status(404).json(fail('Черновик не найден', 'NOT_FOUND'));
      }
      res.status(500).json(fail(e.message || 'patch draft failed', 'INTERNAL'));
    }
  });

  return r;
}
