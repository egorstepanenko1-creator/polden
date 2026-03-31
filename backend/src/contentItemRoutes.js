/**
 * Content Pipeline v1 — `/api/content-items/*` (X-CRM-Token).
 */

import { Router } from 'express';
import {
  buildContentGeneratedUrl,
  contentPublishAttributionWarnings,
  getContentItemGeneratedUrlSafety
} from './contentGeneratedUrl.js';

const STATUSES = new Set(['IDEA', 'DRAFT', 'APPROVED', 'PUBLISHED']);

function ok(data) {
  return { ok: true, data };
}
function fail(message, code = 'BAD_REQUEST') {
  return { ok: false, error: { message, code } };
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 */
function computeGeneratedUrl(row) {
  return buildContentGeneratedUrl({
    channel: row.channel,
    landingPath: row.landingPath,
    targetUrl: row.targetUrl,
    utmSource: row.utmSource,
    utmMedium: row.utmMedium,
    utmCampaign: row.utmCampaign,
    utmContent: row.utmContent
  });
}

/**
 * @param {any} row
 */
export function serializeContentItem(row) {
  const urlSafety = getContentItemGeneratedUrlSafety(row);
  return {
    id: row.id,
    title: row.title,
    channel: row.channel,
    contentType: row.contentType,
    status: row.status,
    publishDate: row.publishDate ? row.publishDate.toISOString() : null,
    captionDraft: row.captionDraft,
    creativeNote: row.creativeNote,
    landingPath: row.landingPath,
    targetUrl: row.targetUrl,
    utmSource: row.utmSource,
    utmMedium: row.utmMedium,
    utmCampaign: row.utmCampaign,
    utmContent: row.utmContent,
    generatedUrl: row.generatedUrl,
    generatedUrlSafety: urlSafety.code,
    generatedUrlPublishSafe: urlSafety.isSafeForPublish,
    contentAttributionWarnings: contentPublishAttributionWarnings(row),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 */
export function createContentItemRouter(prisma) {
  const r = Router();

  r.get('/', async (req, res) => {
    const status = req.query.status != null ? String(req.query.status).trim() : '';
    const channel = req.query.channel != null ? String(req.query.channel).trim() : '';
    const publishDate = req.query.publishDate != null ? String(req.query.publishDate).trim() : '';

    /** @type {import('@prisma/client').Prisma.ContentItemWhereInput} */
    const where = {};
    if (status && STATUSES.has(status)) where.status = status;
    if (channel) where.channel = channel;
    if (publishDate && /^\d{4}-\d{2}-\d{2}$/.test(publishDate)) {
      const start = new Date(`${publishDate}T00:00:00.000Z`);
      const end = new Date(`${publishDate}T23:59:59.999Z`);
      where.publishDate = { gte: start, lte: end };
    }

    try {
      const rows = await prisma.contentItem.findMany({
        where,
        orderBy: [{ publishDate: 'asc' }, { updatedAt: 'desc' }],
        take: 500
      });
      res.json(ok(rows.map(serializeContentItem)));
    } catch (e) {
      res.status(500).json(fail(e.message || 'list content items failed', 'INTERNAL'));
    }
  });

  r.post('/', async (req, res) => {
    const body = req.body || {};
    const title = body.title != null ? String(body.title).trim() : '';
    if (!title) {
      return res.status(400).json(fail('title обязателен', 'VALIDATION'));
    }

    const channel = body.channel != null ? String(body.channel).trim() || 'VK' : 'VK';
    const contentType = body.contentType != null ? String(body.contentType).trim() || 'post' : 'post';
    let status = body.status != null ? String(body.status).trim().toUpperCase() : 'IDEA';
    if (!STATUSES.has(status)) status = 'IDEA';

    let publishDate = null;
    if (body.publishDate != null && String(body.publishDate).trim() !== '') {
      const d = new Date(String(body.publishDate));
      if (Number.isNaN(d.getTime())) {
        return res.status(400).json(fail('publishDate: неверная дата', 'VALIDATION'));
      }
      publishDate = d;
    }

    const captionDraft = body.captionDraft != null ? String(body.captionDraft) : '';
    const creativeNote =
      body.creativeNote != null && String(body.creativeNote).trim() !== ''
        ? String(body.creativeNote).trim().slice(0, 4000)
        : null;
    const landingPath =
      body.landingPath != null && String(body.landingPath).trim() !== ''
        ? String(body.landingPath).trim().slice(0, 512)
        : null;
    const targetUrl =
      body.targetUrl != null && String(body.targetUrl).trim() !== ''
        ? String(body.targetUrl).trim().slice(0, 2000)
        : null;

    let utmSource = body.utmSource != null ? String(body.utmSource).trim() : '';
    if (!utmSource) utmSource = channel.toUpperCase() === 'VK' ? 'vk' : '';
    utmSource = utmSource.slice(0, 256);

    const utmMedium =
      body.utmMedium != null && String(body.utmMedium).trim() !== ''
        ? String(body.utmMedium).trim().slice(0, 256)
        : null;
    const utmCampaign =
      body.utmCampaign != null && String(body.utmCampaign).trim() !== ''
        ? String(body.utmCampaign).trim().slice(0, 256)
        : null;
    const utmContent =
      body.utmContent != null && String(body.utmContent).trim() !== ''
        ? String(body.utmContent).trim().slice(0, 256)
        : null;

    const draftRow = {
      channel,
      landingPath,
      targetUrl,
      utmSource,
      utmMedium,
      utmCampaign,
      utmContent
    };
    const generatedUrl = computeGeneratedUrl(draftRow);

    try {
      const row = await prisma.contentItem.create({
        data: {
          title: title.slice(0, 500),
          channel,
          contentType: contentType.slice(0, 64),
          status,
          publishDate,
          captionDraft: captionDraft.slice(0, 20000),
          creativeNote,
          landingPath,
          targetUrl,
          utmSource,
          utmMedium,
          utmCampaign,
          utmContent,
          generatedUrl
        }
      });
      res.status(201).json(ok(serializeContentItem(row)));
    } catch (e) {
      res.status(500).json(fail(e.message || 'create content item failed', 'INTERNAL'));
    }
  });

  r.get('/:id', async (req, res) => {
    const id = req.params.id != null ? String(req.params.id).trim() : '';
    if (!id) return res.status(400).json(fail('id required', 'VALIDATION'));
    try {
      const row = await prisma.contentItem.findUnique({ where: { id } });
      if (!row) return res.status(404).json(fail('Not found', 'NOT_FOUND'));
      res.json(ok(serializeContentItem(row)));
    } catch (e) {
      res.status(500).json(fail(e.message || 'get content item failed', 'INTERNAL'));
    }
  });

  r.patch('/:id', async (req, res) => {
    const id = req.params.id != null ? String(req.params.id).trim() : '';
    if (!id) return res.status(400).json(fail('id required', 'VALIDATION'));
    const body = req.body || {};

    try {
      const existing = await prisma.contentItem.findUnique({ where: { id } });
      if (!existing) return res.status(404).json(fail('Not found', 'NOT_FOUND'));

      /** @type {import('@prisma/client').Prisma.ContentItemUpdateInput} */
      const data = {};

      if (body.title !== undefined) {
        const t = String(body.title).trim();
        if (!t) return res.status(400).json(fail('title не может быть пустым', 'VALIDATION'));
        data.title = t.slice(0, 500);
      }
      if (body.channel !== undefined) data.channel = String(body.channel).trim().slice(0, 32) || existing.channel;
      if (body.contentType !== undefined)
        data.contentType = String(body.contentType).trim().slice(0, 64) || existing.contentType;
      if (body.status !== undefined) {
        const s = String(body.status).trim().toUpperCase();
        if (!STATUSES.has(s)) return res.status(400).json(fail('неверный status', 'VALIDATION'));
        data.status = s;
      }
      if (body.publishDate !== undefined) {
        if (body.publishDate === null || String(body.publishDate).trim() === '') {
          data.publishDate = null;
        } else {
          const d = new Date(String(body.publishDate));
          if (Number.isNaN(d.getTime())) {
            return res.status(400).json(fail('publishDate: неверная дата', 'VALIDATION'));
          }
          data.publishDate = d;
        }
      }
      if (body.captionDraft !== undefined) data.captionDraft = String(body.captionDraft).slice(0, 20000);
      if (body.creativeNote !== undefined) {
        data.creativeNote =
          body.creativeNote === null || String(body.creativeNote).trim() === ''
            ? null
            : String(body.creativeNote).trim().slice(0, 4000);
      }
      if (body.landingPath !== undefined) {
        data.landingPath =
          body.landingPath === null || String(body.landingPath).trim() === ''
            ? null
            : String(body.landingPath).trim().slice(0, 512);
      }
      if (body.targetUrl !== undefined) {
        data.targetUrl =
          body.targetUrl === null || String(body.targetUrl).trim() === ''
            ? null
            : String(body.targetUrl).trim().slice(0, 2000);
      }
      if (body.utmSource !== undefined) {
        let u = String(body.utmSource).trim().slice(0, 256);
        const ch = body.channel !== undefined ? String(body.channel).trim() : existing.channel;
        if (!u && String(ch).toUpperCase() === 'VK') u = 'vk';
        data.utmSource = u;
      }
      if (body.utmMedium !== undefined) {
        data.utmMedium =
          body.utmMedium === null || String(body.utmMedium).trim() === ''
            ? null
            : String(body.utmMedium).trim().slice(0, 256);
      }
      if (body.utmCampaign !== undefined) {
        data.utmCampaign =
          body.utmCampaign === null || String(body.utmCampaign).trim() === ''
            ? null
            : String(body.utmCampaign).trim().slice(0, 256);
      }
      if (body.utmContent !== undefined) {
        data.utmContent =
          body.utmContent === null || String(body.utmContent).trim() === ''
            ? null
            : String(body.utmContent).trim().slice(0, 256);
      }

      const merged = {
        channel: data.channel ?? existing.channel,
        landingPath: data.landingPath !== undefined ? data.landingPath : existing.landingPath,
        targetUrl: data.targetUrl !== undefined ? data.targetUrl : existing.targetUrl,
        utmSource: data.utmSource !== undefined ? data.utmSource : existing.utmSource,
        utmMedium: data.utmMedium !== undefined ? data.utmMedium : existing.utmMedium,
        utmCampaign: data.utmCampaign !== undefined ? data.utmCampaign : existing.utmCampaign,
        utmContent: data.utmContent !== undefined ? data.utmContent : existing.utmContent
      };
      if (String(merged.channel).toUpperCase() === 'VK' && !String(merged.utmSource || '').trim()) {
        merged.utmSource = 'vk';
        data.utmSource = 'vk';
      }
      data.generatedUrl = computeGeneratedUrl(merged);

      const row = await prisma.contentItem.update({
        where: { id },
        data
      });
      res.json(ok(serializeContentItem(row)));
    } catch (e) {
      res.status(500).json(fail(e.message || 'patch content item failed', 'INTERNAL'));
    }
  });

  return r;
}
