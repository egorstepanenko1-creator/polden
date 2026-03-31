/**
 * Сумма по позициям меню на дату (копейки). Авторитетная сумма для quote и create.
 * @param {import('@prisma/client').PrismaClient} prisma
 */
export async function computeQuoteKopeks(prisma, branchId, deliveryDate, items) {
  if (!branchId || !deliveryDate || !Array.isArray(items) || items.length === 0) {
    throw new Error('branchId, deliveryDate and non-empty items required');
  }

  const menuRows = await prisma.menuDayItem.findMany({
    where: { branchId, date: deliveryDate }
  });
  const priceByPos = new Map(menuRows.map((r) => [r.position, r]));

  let totalAmount = 0;
  let comboQty = 0;
  let comboUnitPrice = 0;
  let extrasTotal = 0;

  for (const line of items) {
    const position = Number(line.position);
    const qty = Number(line.qty);
    if (!Number.isInteger(position) || position < 1 || position > 10) {
      throw new Error(`Invalid position: ${line.position}`);
    }
    if (!Number.isInteger(qty) || qty < 1 || qty > 99) {
      throw new Error(`Invalid qty: ${line.qty}`);
    }
    const row = priceByPos.get(position);
    if (!row || !String(row.name || '').trim()) {
      throw new Error(`Menu position ${position} not available for this date`);
    }
    totalAmount += row.price * qty;
    if (position >= 7) extrasTotal += row.price * qty;
  }

  const g1 = [1, 2].map((p) => priceByPos.get(p)).find((r) => r && String(r.name || '').trim());
  const g2 = [3, 4].map((p) => priceByPos.get(p)).find((r) => r && String(r.name || '').trim());
  const g3 = [5, 6].map((p) => priceByPos.get(p)).find((r) => r && String(r.name || '').trim());
  if (g1 && g2 && g3) {
    comboUnitPrice = g1.price + g2.price + g3.price;
    const q1 = items.filter((i) => [1, 2].includes(Number(i.position))).reduce((s, i) => s + Number(i.qty), 0);
    const q2 = items.filter((i) => [3, 4].includes(Number(i.position))).reduce((s, i) => s + Number(i.qty), 0);
    const q3 = items.filter((i) => [5, 6].includes(Number(i.position))).reduce((s, i) => s + Number(i.qty), 0);
    comboQty = Math.min(q1 > 0 ? q1 : 0, q2 > 0 ? q2 : 0, q3 > 0 ? q3 : 0);
    if (q1 === 0 || q2 === 0 || q3 === 0) comboQty = 0;
  }

  return {
    totalAmount,
    comboQty,
    comboUnitPrice,
    extrasTotal
  };
}
