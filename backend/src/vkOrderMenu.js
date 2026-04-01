/**
 * Реальное меню на дату (MenuDayItem) для VK-заказа — тот же источник, что pricing/public API.
 */

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} branchId
 * @param {string} date YYYY-MM-DD
 */
export async function loadOrderableMenuRows(prisma, branchId, date) {
  const rows = await prisma.menuDayItem.findMany({
    where: { branchId: String(branchId), date: String(date) },
    orderBy: { position: 'asc' }
  });
  return rows.filter((r) => String(r.name || '').trim().length > 0);
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} date YYYY-MM-DD
 * @returns {Promise<boolean>}
 */
export async function anyBranchHasSellableMenuOnDate(prisma, date) {
  const rows = await prisma.menuDayItem.findMany({
    where: { date: String(date) },
    select: { name: true }
  });
  return rows.some((r) => String(r.name || '').trim().length > 0);
}

/**
 * @param {Array<{ position: number, name: string, price: number }>} rows
 */
export function formatVkOrderableMenuText(rows) {
  if (!rows.length) return 'Меню на выбранную дату пусто (нет названий в CRM).';
  const lines = rows.map((r) => {
    const rub = (Number(r.price) / 100).toLocaleString('ru-RU', { maximumFractionDigits: 0 });
    return `${r.position}. ${String(r.name).trim()} — ${rub} ₽`;
  });
  return `Меню на доставку (позиции для заказа):\n${lines.join('\n')}`;
}
