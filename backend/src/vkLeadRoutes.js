/**
 * VK-лиды CRM — `/api/vk-leads/*` (X-CRM-Token).
 */

import { Router } from 'express';

const STATUSES = new Set(['NEW', 'CONTACTED', 'CONVERTED', 'REJECTED']);

function ok(data) {
  return { ok: true, data };
}
function fail(message, code = 'BAD_REQUEST') {
  return { ok: false, error: { message, code } };
}

/**
 * @param {any} row
 */
function serializeLead(row) {
  return {
    id: row.id,
    source: row.source,
    channel: row.channel,
    vkUserId: row.vkUserId,
    peerId: row.peerId,
    name: row.name,
    phone: row.phone,
    address: row.address,
    requestedDateText: row.requestedDateText,
    comment: row.comment,
    status: row.status,
    rawPayloadJson: row.rawPayloadJson,
    menuContentItemId: row.menuContentItemId,
    attributionCampaign: row.attributionCampaign,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 */
export function createVkLeadRouter(prisma) {
  const r = Router();

  r.get('/', async (req, res) => {
    const status = req.query.status != null ? String(req.query.status).trim() : '';
    /** @type {import('@prisma/client').Prisma.VkLeadWhereInput} */
    const where = {};
    if (status && STATUSES.has(status)) where.status = status;
    try {
      const rows = await prisma.vkLead.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 300
      });
      res.json(ok(rows.map(serializeLead)));
    } catch (e) {
      res.status(500).json(fail(e.message || 'list vk leads failed', 'INTERNAL'));
    }
  });

  r.get('/:id', async (req, res) => {
    const id = req.params.id != null ? String(req.params.id).trim() : '';
    if (!id) return res.status(400).json(fail('id required', 'VALIDATION'));
    try {
      const row = await prisma.vkLead.findUnique({ where: { id } });
      if (!row) return res.status(404).json(fail('Not found', 'NOT_FOUND'));
      res.json(ok(serializeLead(row)));
    } catch (e) {
      res.status(500).json(fail(e.message || 'get vk lead failed', 'INTERNAL'));
    }
  });

  r.patch('/:id', async (req, res) => {
    const id = req.params.id != null ? String(req.params.id).trim() : '';
    if (!id) return res.status(400).json(fail('id required', 'VALIDATION'));
    const body = req.body || {};
    /** @type {import('@prisma/client').Prisma.VkLeadUpdateInput} */
    const data = {};
    if (body.status !== undefined) {
      const s = String(body.status).trim().toUpperCase();
      if (!STATUSES.has(s)) return res.status(400).json(fail('неверный status', 'VALIDATION'));
      data.status = s;
    }
    if (Object.keys(data).length === 0) {
      return res.status(400).json(fail('нет полей для обновления', 'VALIDATION'));
    }
    try {
      const row = await prisma.vkLead.update({ where: { id }, data });
      res.json(ok(serializeLead(row)));
    } catch (e) {
      if (e.code === 'P2025') return res.status(404).json(fail('Not found', 'NOT_FOUND'));
      res.status(500).json(fail(e.message || 'patch vk lead failed', 'INTERNAL'));
    }
  });

  r.post('/:id/convert', async (req, res) => {
    const id = req.params.id != null ? String(req.params.id).trim() : '';
    if (!id) return res.status(400).json(fail('id required', 'VALIDATION'));
    try {
      const row = await prisma.vkLead.findUnique({ where: { id } });
      if (!row) return res.status(404).json(fail('Not found', 'NOT_FOUND'));

      const updated = await prisma.vkLead.update({
        where: { id },
        data: { status: 'CONVERTED' }
      });

      const prefill = {
        customerName: updated.name,
        customerPhone: updated.phone,
        address: updated.address,
        deliveryDateText: updated.requestedDateText,
        comment: [
          updated.comment,
          `Лид VK ${updated.id}`,
          updated.attributionCampaign ? `кампания: ${updated.attributionCampaign}` : ''
        ]
          .filter(Boolean)
          .join(' | ')
      };

      res.json(
        ok({
          lead: serializeLead(updated),
          prefill,
          hint:
            'Заказ не создан автоматически. В CRM откройте «Заказы и KPI», выберите филиал и дату доставки, оформите заказ через публичный сценарий или вручную, подставив скопированные данные.'
        })
      );
    } catch (e) {
      res.status(500).json(fail(e.message || 'convert failed', 'INTERNAL'));
    }
  });

  return r;
}
