/**
 * Ежедневная операционная аналитика по DeliveryOrder (одна точка + дата доставки).
 * Без отдельных таблиц — только чтение заказов.
 */

import { DELIVERY_ORDER_STATUSES, SOURCE_CHANNELS } from './deliveryOrderService.js';

/** Пороги внимания — детерминированные, см. docs/DAILY_OPS_ANALYTICS_V1.md */
export const DAILY_OPS_ATTENTION_THRESHOLDS = {
  MANY_NEW_ABSOLUTE: 8,
  MANY_NEW_RATIO: 0.45,
  MANY_NEW_MIN_TOTAL: 5,
  HIGH_CANCELED_RATIO: 0.25,
  HIGH_CANCELED_MIN_ORDERS: 4,
  MANY_KITCHEN_ABSOLUTE: 10,
  MANY_KITCHEN_RATIO: 0.35,
  MANY_KITCHEN_MIN_TOTAL: 5,
  STUCK_TAIL_MIN: 6,
  STUCK_DONE_MAX_RATIO: 0.15,
  STUCK_MIN_TOTAL: 5,
  NO_DONE_PIPELINE_MIN: 5,
  NO_DONE_KITCHEN_DELIVERING_MIN: 2
};

/**
 * @param {Array<import('@prisma/client').DeliveryOrder & { items: Array<{ position: number, qty: number }> }>} orders
 * @param {string} branchId
 * @param {string} deliveryDate
 */
export function aggregateDailyOps(orders, branchId, deliveryDate) {
  const list = Array.isArray(orders) ? orders : [];
  const totalOrders = list.length;
  let totalRevenueKopeks = 0;
  /** @type {Record<string, number>} */
  const bySource = {};
  /** @type {Record<string, number>} */
  const byStatus = {};
  for (const ch of SOURCE_CHANNELS) bySource[ch] = 0;
  for (const st of DELIVERY_ORDER_STATUSES) byStatus[st] = 0;

  /** @type {Map<number, number>} */
  const posQty = new Map();

  for (const o of list) {
    totalRevenueKopeks += Number(o.totalAmount) || 0;
    const ch = SOURCE_CHANNELS.includes(String(o.sourceChannel || '').trim())
      ? String(o.sourceChannel).trim()
      : 'SITE';
    bySource[ch] = (bySource[ch] || 0) + 1;
    const st = DELIVERY_ORDER_STATUSES.includes(String(o.status || '').trim())
      ? String(o.status).trim()
      : 'NEW';
    byStatus[st] = (byStatus[st] || 0) + 1;
    for (const it of o.items || []) {
      const p = Number(it.position);
      const q = Number(it.qty) || 0;
      if (p >= 1 && p <= 10 && q > 0) posQty.set(p, (posQty.get(p) || 0) + q);
    }
  }

  const newOrdersCount = byStatus.NEW || 0;
  const confirmedOrdersCount = byStatus.CONFIRMED || 0;
  const inProgressCount = (byStatus.KITCHEN || 0) + (byStatus.DELIVERING || 0);
  const doneOrdersCount = byStatus.DONE || 0;
  const canceledOrdersCount = byStatus.CANCELED || 0;
  const averageOrderValueKopeks = totalOrders > 0 ? Math.round(totalRevenueKopeks / totalOrders) : 0;

  const topPositions = [...posQty.entries()]
    .map(([position, totalQty]) => ({ position, totalQty }))
    .sort((a, b) => b.totalQty - a.totalQty || a.position - b.position)
    .slice(0, 10);

  const latestOrders = [...list]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 10)
    .map((o) => ({
      id: o.id,
      createdAt: o.createdAt.toISOString(),
      customerName: o.customerName,
      status: o.status || 'NEW',
      sourceChannel: o.sourceChannel || 'SITE',
      totalAmount: o.totalAmount
    }));

  const stats = {
    totalOrders,
    totalRevenueKopeks,
    newOrdersCount,
    confirmedOrdersCount,
    inProgressCount,
    doneOrdersCount,
    canceledOrdersCount,
    kitchenCount: byStatus.KITCHEN || 0,
    deliveringCount: byStatus.DELIVERING || 0,
    byStatus,
    bySource
  };

  const attention = computeAttention(stats);

  return {
    branchId: String(branchId),
    deliveryDate: String(deliveryDate),
    totalOrders,
    totalRevenueKopeks,
    averageOrderValueKopeks,
    bySource,
    byStatus,
    newOrdersCount,
    confirmedOrdersCount,
    inProgressCount,
    doneOrdersCount,
    canceledOrdersCount,
    topPositions,
    latestOrders,
    attention
  };
}

/**
 * @param {{
 *   totalOrders: number,
 *   totalRevenueKopeks: number,
 *   newOrdersCount: number,
 *   confirmedOrdersCount: number,
 *   inProgressCount: number,
 *   doneOrdersCount: number,
 *   canceledOrdersCount: number,
 *   kitchenCount: number,
 *   deliveringCount: number,
 *   byStatus: Record<string, number>,
 *   bySource: Record<string, number>
 * }} s
 */
export function computeAttention(s) {
  /** @type {Array<{ code: string, severity: 'info' | 'warn', message: string }>} */
  const out = [];
  const T = DAILY_OPS_ATTENTION_THRESHOLDS;
  const n = s.totalOrders;

  if (n === 0) {
    out.push({
      code: 'ZERO_ORDERS',
      severity: 'info',
      message: 'На эту дату доставки заказов нет — проверьте меню и каналы привлечения.'
    });
    return out;
  }

  const newC = s.newOrdersCount;
  if (newC >= T.MANY_NEW_ABSOLUTE || (n >= T.MANY_NEW_MIN_TOTAL && newC / n >= T.MANY_NEW_RATIO)) {
    out.push({
      code: 'MANY_NEW',
      severity: 'warn',
      message: `Много заказов в статусе «Новый» (${newC} из ${n}) — стоит подтвердить или обработать.`
    });
  }

  const canc = s.canceledOrdersCount;
  if (n >= T.HIGH_CANCELED_MIN_ORDERS && canc / n >= T.HIGH_CANCELED_RATIO) {
    out.push({
      code: 'HIGH_CANCELED_SHARE',
      severity: 'warn',
      message: `Высокая доля отмен (${canc} из ${n}) — проверьте причины и коммуникацию.`
    });
  }

  const k = s.kitchenCount;
  if (k >= T.MANY_KITCHEN_ABSOLUTE || (n >= T.MANY_KITCHEN_MIN_TOTAL && k / n >= T.MANY_KITCHEN_RATIO)) {
    out.push({
      code: 'MANY_IN_KITCHEN',
      severity: 'warn',
      message: `Много заказов на кухне (${k}) — риск задержек по цепочке.`
    });
  }

  const tail = s.newOrdersCount + s.confirmedOrdersCount;
  if (n >= T.STUCK_MIN_TOTAL && tail >= T.STUCK_TAIL_MIN && s.doneOrdersCount / n <= T.STUCK_DONE_MAX_RATIO) {
    out.push({
      code: 'LOW_DONE_SHARE',
      severity: 'warn',
      message: `Мало завершённых заказов (${s.doneOrdersCount} из ${n}) при большом хвосте NEW/CONFIRMED — проверьте процесс.`
    });
  }

  if (
    n >= T.NO_DONE_PIPELINE_MIN &&
    s.doneOrdersCount === 0 &&
    s.kitchenCount + s.deliveringCount >= T.NO_DONE_KITCHEN_DELIVERING_MIN
  ) {
    out.push({
      code: 'NO_DONE_IN_PIPELINE',
      severity: 'warn',
      message: 'Заказы уже в кухне/доставке, но ни одного «Завершён» — убедитесь, что статусы обновляются.'
    });
  }

  return out;
}

/**
 * @param {ReturnType<typeof aggregateDailyOps>} primary
 * @param {ReturnType<typeof aggregateDailyOps>} compare
 */
export function buildCompareDeltas(primary, compare) {
  /** @type {Record<string, number>} */
  const bySource = {};
  for (const ch of SOURCE_CHANNELS) {
    bySource[ch] = (primary.bySource[ch] || 0) - (compare.bySource[ch] || 0);
  }
  return {
    totalOrders: primary.totalOrders - compare.totalOrders,
    totalRevenueKopeks: primary.totalRevenueKopeks - compare.totalRevenueKopeks,
    averageOrderValueKopeks: primary.averageOrderValueKopeks - compare.averageOrderValueKopeks,
    bySource
  };
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} branchId
 * @param {string} deliveryDate YYYY-MM-DD
 */
export async function fetchOrdersForDailyOps(prisma, branchId, deliveryDate) {
  return prisma.deliveryOrder.findMany({
    where: {
      branchId: String(branchId),
      deliveryDate: String(deliveryDate)
    },
    include: {
      items: { select: { position: true, qty: true } }
    },
    orderBy: { createdAt: 'desc' }
  });
}
