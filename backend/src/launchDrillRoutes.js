/**
 * Launch drill records — `/api/launch-drills/*` (X-CRM-Token). Ручной аудит, без автозаказов.
 */

import { Router } from 'express';
import { resolvePublicSiteOriginMeta } from './contentGeneratedUrl.js';
import { serializeContentItem } from './contentItemRoutes.js';
import { getContentPerformanceEvidenceForItem } from './contentPerformance.js';

const COMPLETE_STATUSES = new Set(['SUCCESS', 'FAILED', 'PARTIAL']);

function ok(data) {
  return { ok: true, data };
}
function fail(message, code = 'BAD_REQUEST') {
  return { ok: false, error: { message, code } };
}

/**
 * @param {any} row
 */
function serializeDrill(row) {
  /** @type {object | null} */
  let originStatusAtRun = null;
  try {
    originStatusAtRun = JSON.parse(row.originStatusAtRun);
  } catch {
    originStatusAtRun = null;
  }
  /** @type {Record<string, unknown>} */
  const out = {
    id: row.id,
    contentItemId: row.contentItemId,
    contentItemTitle: row.contentItem?.title ?? null,
    expectedGeneratedUrl: row.expectedGeneratedUrl,
    originStatusAtRun,
    runStatus: row.runStatus,
    startedAt: row.startedAt.toISOString(),
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    observedOrderId: row.observedOrderId,
    observedRevenueKopeks: row.observedRevenueKopeks,
    observedAttributionSummary: row.observedAttributionSummary,
    note: row.note,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
  if (row.contentItem && typeof row.contentItem.generatedUrl === 'string') {
    out.contentItem = serializeContentItem(row.contentItem);
  }
  return out;
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {any} row
 */
async function serializeDrillWithEvidence(prisma, row) {
  const base = serializeDrill(row);
  const performanceEvidence = await getContentPerformanceEvidenceForItem(prisma, row.contentItemId);
  return { ...base, performanceEvidence };
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 */
export function createLaunchDrillRouter(prisma) {
  const r = Router();

  r.post('/start', async (req, res) => {
    const contentItemId = req.body?.contentItemId != null ? String(req.body.contentItemId).trim() : '';
    if (!contentItemId) {
      return res.status(400).json(fail('contentItemId обязателен', 'VALIDATION'));
    }
    try {
      const item = await prisma.contentItem.findUnique({ where: { id: contentItemId } });
      if (!item) return res.status(404).json(fail('Content item не найден', 'NOT_FOUND'));

      const originMeta = resolvePublicSiteOriginMeta();
      const row = await prisma.launchDrillRecord.create({
        data: {
          contentItemId: item.id,
          expectedGeneratedUrl: item.generatedUrl || '',
          originStatusAtRun: JSON.stringify(originMeta),
          runStatus: 'STARTED'
        },
        include: { contentItem: true }
      });
      res.status(201).json(ok(await serializeDrillWithEvidence(prisma, row)));
    } catch (e) {
      res.status(500).json(fail(e.message || 'start drill failed', 'INTERNAL'));
    }
  });

  r.post('/:id/complete', async (req, res) => {
    const id = req.params.id != null ? String(req.params.id).trim() : '';
    if (!id) return res.status(400).json(fail('id required', 'VALIDATION'));

    const body = req.body || {};
    const runStatus = body.runStatus != null ? String(body.runStatus).trim().toUpperCase() : '';
    if (!COMPLETE_STATUSES.has(runStatus)) {
      return res.status(400).json(fail('runStatus: ожидается SUCCESS, FAILED или PARTIAL', 'VALIDATION'));
    }

    const observedOrderId =
      body.observedOrderId != null && String(body.observedOrderId).trim() !== ''
        ? String(body.observedOrderId).trim().slice(0, 128)
        : null;
    let observedRevenueKopeks = null;
    if (body.observedRevenueKopeks != null && String(body.observedRevenueKopeks).trim() !== '') {
      const n = Number(body.observedRevenueKopeks);
      if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
        return res.status(400).json(fail('observedRevenueKopeks: целое число ≥ 0', 'VALIDATION'));
      }
      observedRevenueKopeks = n;
    }
    const observedAttributionSummary =
      body.observedAttributionSummary != null && String(body.observedAttributionSummary).trim() !== ''
        ? String(body.observedAttributionSummary).trim().slice(0, 2000)
        : null;
    const note =
      body.note != null && String(body.note).trim() !== '' ? String(body.note).trim().slice(0, 8000) : null;

    try {
      const existing = await prisma.launchDrillRecord.findUnique({
        where: { id },
        include: { contentItem: { select: { title: true } } }
      });
      if (!existing) return res.status(404).json(fail('Drill не найден', 'NOT_FOUND'));
      if (existing.runStatus !== 'STARTED') {
        return res.status(400).json(fail('drill уже завершён', 'INVALID_STATE'));
      }

      const row = await prisma.launchDrillRecord.update({
        where: { id },
        data: {
          runStatus,
          completedAt: new Date(),
          observedOrderId,
          observedRevenueKopeks,
          observedAttributionSummary,
          note
        },
        include: { contentItem: true }
      });
      res.json(ok(await serializeDrillWithEvidence(prisma, row)));
    } catch (e) {
      res.status(500).json(fail(e.message || 'complete drill failed', 'INTERNAL'));
    }
  });

  r.get('/', async (req, res) => {
    try {
      const rows = await prisma.launchDrillRecord.findMany({
        orderBy: { startedAt: 'desc' },
        take: 200,
        include: { contentItem: { select: { title: true } } }
      });
      res.json(ok(rows.map(serializeDrill)));
    } catch (e) {
      res.status(500).json(fail(e.message || 'list drills failed', 'INTERNAL'));
    }
  });

  r.get('/:id', async (req, res) => {
    const id = req.params.id != null ? String(req.params.id).trim() : '';
    if (!id) return res.status(400).json(fail('id required', 'VALIDATION'));
    try {
      const row = await prisma.launchDrillRecord.findUnique({
        where: { id },
        include: { contentItem: true }
      });
      if (!row) return res.status(404).json(fail('Not found', 'NOT_FOUND'));
      res.json(ok(await serializeDrillWithEvidence(prisma, row)));
    } catch (e) {
      res.status(500).json(fail(e.message || 'get drill failed', 'INTERNAL'));
    }
  });

  return r;
}
