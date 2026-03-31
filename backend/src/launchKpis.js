import { parseAttributionJson } from './attribution.js';
import { orderSourceKey } from './orderSource.js';

/**
 * @param {Array<{ deliveryDate: string, totalAmount: number, createdAt: Date, attributionJson: string | null, customerName: string, id: string }>} orders
 * @param {{ days: number, since: Date }} period
 */
export function buildLaunchKpiPayload(orders, period) {
  const orderCount = orders.length;
  const revenueKopeks = orders.reduce((s, o) => s + (Number(o.totalAmount) || 0), 0);
  const aovKopeks = orderCount > 0 ? Math.round(revenueKopeks / orderCount) : 0;

  /** @type {Map<string, { orderCount: number, revenueKopeks: number }>} */
  const byDeliv = new Map();
  for (const o of orders) {
    const d = String(o.deliveryDate || '');
    if (!d) continue;
    const cur = byDeliv.get(d) || { orderCount: 0, revenueKopeks: 0 };
    cur.orderCount += 1;
    cur.revenueKopeks += Number(o.totalAmount) || 0;
    byDeliv.set(d, cur);
  }
  const byDeliveryDate = [...byDeliv.entries()]
    .map(([deliveryDate, v]) => ({ deliveryDate, ...v }))
    .sort((a, b) => (a.deliveryDate < b.deliveryDate ? 1 : a.deliveryDate > b.deliveryDate ? -1 : 0));

  /** @type {Map<string, { orderCount: number, revenueKopeks: number }>} */
  const bySource = new Map();
  for (const o of orders) {
    const att = parseAttributionJson(o.attributionJson);
    const source = orderSourceKey(att);
    const cur = bySource.get(source) || { orderCount: 0, revenueKopeks: 0 };
    cur.orderCount += 1;
    cur.revenueKopeks += Number(o.totalAmount) || 0;
    bySource.set(source, cur);
  }

  const topSourcesByCount = [...bySource.entries()]
    .map(([source, v]) => ({ source, ...v }))
    .sort((a, b) => b.orderCount - a.orderCount || b.revenueKopeks - a.revenueKopeks)
    .slice(0, 8);

  const topSourcesByRevenue = [...bySource.entries()]
    .map(([source, v]) => ({ source, ...v }))
    .sort((a, b) => b.revenueKopeks - a.revenueKopeks || b.orderCount - a.orderCount)
    .slice(0, 8);

  const recentSorted = [...orders].sort((a, b) => b.createdAt - a.createdAt).slice(0, 12);

  const recentOrders = recentSorted.map((o) => {
    const att = parseAttributionJson(o.attributionJson);
    return {
      id: o.id,
      createdAt: o.createdAt.toISOString(),
      deliveryDate: o.deliveryDate,
      customerName: o.customerName,
      totalAmount: o.totalAmount,
      source: orderSourceKey(att)
    };
  });

  return {
    period: {
      days: period.days,
      since: period.since.toISOString()
    },
    totals: {
      orderCount,
      revenueKopeks,
      aovKopeks
    },
    byDeliveryDate,
    topSourcesByCount,
    topSourcesByRevenue,
    recentOrders
  };
}
