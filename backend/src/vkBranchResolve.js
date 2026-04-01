/**
 * Единая логика точки для VK: меню и старт заказа должны сходиться.
 *
 * Порядок принудительной точки (без выбора номером):
 * 1) POLDEN_VK_DEFAULT_BRANCH_ID — если есть в БД
 * 2) ровно одна Branch в БД
 * 3) POLDEN_VK_ORDER_PROBE_BRANCH_ID — если есть в БД
 *
 * Если точек несколько и (1)–(3) не задали валидную точку — заказ идёт в выбор номером;
 * кнопка «Меню» не подставляет «первую по алфавиту» (нужен env или сначала «Оформить заказ»).
 */

/** @param {Array<{ id: string, name: string }>} branches */
export function resolveVkForcedBranchFromList(branches) {
  if (!Array.isArray(branches) || branches.length === 0) return null;
  const defId = (process.env.POLDEN_VK_DEFAULT_BRANCH_ID || '').trim();
  if (defId) {
    const b = branches.find((x) => x.id === defId);
    if (b) return b;
  }
  if (branches.length === 1) return branches[0];
  const probeId = (process.env.POLDEN_VK_ORDER_PROBE_BRANCH_ID || '').trim();
  if (probeId) {
    const b = branches.find((x) => x.id === probeId);
    if (b) return b;
  }
  return null;
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @returns {Promise<{ branches: import('@prisma/client').Branch[], forced: import('@prisma/client').Branch | null }>}
 */
export async function loadBranchesAndVkForced(prisma) {
  const branches = await prisma.branch.findMany({ orderBy: { name: 'asc' } });
  return { branches, forced: resolveVkForcedBranchFromList(branches) };
}

/** Как зафиксирована точка для операторов / readiness (строка-код). */
export function describeVkBranchResolution(forced, branches) {
  if (!branches.length) return 'none';
  if (branches.length === 1) return 'single_branch';
  if (!forced) return 'multi_branch_pick_required';
  const defId = (process.env.POLDEN_VK_DEFAULT_BRANCH_ID || '').trim();
  const probeId = (process.env.POLDEN_VK_ORDER_PROBE_BRANCH_ID || '').trim();
  if (defId && forced.id === defId) return 'POLDEN_VK_DEFAULT_BRANCH_ID';
  if (probeId && forced.id === probeId) return 'POLDEN_VK_ORDER_PROBE_BRANCH_ID';
  return 'forced';
}
