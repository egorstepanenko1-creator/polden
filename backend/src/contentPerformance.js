/**
 * Content Performance v1 — read-only сводка заказов по материалам (атрибуция из DeliveryOrder).
 */

import { parseAttributionJson } from './attribution.js';
import { serializeContentItem } from './contentItemRoutes.js';
import { attributionMatchesContentItem } from './contentPerformanceMatch.js';

const STATUSES = new Set(['IDEA', 'DRAFT', 'APPROVED', 'PUBLISHED']);

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 */
export async function loadParsedAttributedOrders(prisma) {
  const orders = await prisma.deliveryOrder.findMany({
    where: { attributionJson: { not: null } },
    select: { totalAmount: true, createdAt: true, attributionJson: true }
  });
  return orders
    .map((o) => ({
      totalAmount: o.totalAmount,
      createdAt: o.createdAt,
      att: parseAttributionJson(o.attributionJson)
    }))
    .filter((o) => o.att != null);
}

/**
 * @param {import('@prisma/client').ContentItem} item
 * @param {Array<{ totalAmount: number, createdAt: Date, att: Record<string, string> }>} parsedOrders
 */
export function computePerformanceForContentItem(item, parsedOrders) {
  const matched = parsedOrders.filter((o) => attributionMatchesContentItem(o.att, item));
  const ordersCount = matched.length;
  const revenueKopeks = matched.reduce((s, o) => s + (Number(o.totalAmount) || 0), 0);
  const averageOrderValueKopeks = ordersCount > 0 ? Math.round(revenueKopeks / ordersCount) : 0;
  let latestOrderAt = null;
  let firstOrderAt = null;
  if (matched.length) {
    const sorted = [...matched].sort((a, b) => +a.createdAt - +b.createdAt);
    firstOrderAt = sorted[0].createdAt.toISOString();
    latestOrderAt = sorted[sorted.length - 1].createdAt.toISOString();
  }
  return {
    ordersCount,
    revenueKopeks,
    averageOrderValueKopeks,
    latestOrderAt,
    firstOrderAt
  };
}

/**
 * Текущие метрики Performance для одного материала (тот же матчинг, что в списке).
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} contentItemId
 * @returns {Promise<{ ordersCount: number, revenueKopeks: number, latestOrderAt: string | null } | null>}
 */
export async function getContentPerformanceEvidenceForItem(prisma, contentItemId) {
  const id = contentItemId != null ? String(contentItemId).trim() : '';
  if (!id) return null;
  const item = await prisma.contentItem.findUnique({ where: { id } });
  if (!item) return null;
  const parsedOrders = await loadParsedAttributedOrders(prisma);
  const p = computePerformanceForContentItem(item, parsedOrders);
  return {
    ordersCount: p.ordersCount,
    revenueKopeks: p.revenueKopeks,
    latestOrderAt: p.latestOrderAt
  };
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {Record<string, string | undefined>} query
 */
export async function buildContentPerformanceList(prisma, query) {
  const status = query.status != null ? String(query.status).trim() : '';
  const channel = query.channel != null ? String(query.channel).trim() : '';
  const publishDateFrom = query.publishDateFrom != null ? String(query.publishDateFrom).trim() : '';
  const publishDateTo = query.publishDateTo != null ? String(query.publishDateTo).trim() : '';
  const hasOrders = query.hasOrders != null ? String(query.hasOrders).trim() : '';

  /** @type {import('@prisma/client').Prisma.ContentItemWhereInput} */
  const where = {};
  if (status && STATUSES.has(status)) where.status = status;
  if (channel) where.channel = channel;

  const dFromOk = publishDateFrom && /^\d{4}-\d{2}-\d{2}$/.test(publishDateFrom);
  const dToOk = publishDateTo && /^\d{4}-\d{2}-\d{2}$/.test(publishDateTo);
  if (dFromOk && dToOk && publishDateFrom === publishDateTo) {
    where.publishDate = {
      gte: new Date(`${publishDateFrom}T00:00:00.000Z`),
      lte: new Date(`${publishDateFrom}T23:59:59.999Z`)
    };
  } else {
    if (dFromOk) {
      where.publishDate = {
        ...(where.publishDate && typeof where.publishDate === 'object' ? where.publishDate : {}),
        gte: new Date(`${publishDateFrom}T00:00:00.000Z`)
      };
    }
    if (dToOk) {
      where.publishDate = {
        ...(where.publishDate && typeof where.publishDate === 'object' ? where.publishDate : {}),
        lte: new Date(`${publishDateTo}T23:59:59.999Z`)
      };
    }
  }

  const items = await prisma.contentItem.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    take: 500
  });

  const parsedOrders = await loadParsedAttributedOrders(prisma);

  let rows = items.map((item) => ({
    ...serializeContentItem(item),
    performance: computePerformanceForContentItem(item, parsedOrders)
  }));

  if (hasOrders === '1') rows = rows.filter((r) => r.performance.ordersCount > 0);
  if (hasOrders === '0') rows = rows.filter((r) => r.performance.ordersCount === 0);

  rows.sort((a, b) => {
    const dr = b.performance.revenueKopeks - a.performance.revenueKopeks;
    if (dr !== 0) return dr;
    const dc = b.performance.ordersCount - a.performance.ordersCount;
    if (dc !== 0) return dc;
    return String(a.title).localeCompare(String(b.title), 'ru');
  });

  return rows;
}
