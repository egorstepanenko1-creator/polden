/**
 * Текст кнопки «Меню» в VK: первичный источник — MenuDayItem (как и у «Оформить заказ»).
 * ContentItem MENU_DAILY — только опциональное дополнение (POLDEN_VK_APPEND_MENU_DAILY=1).
 */

import { loadOrderableMenuRows } from './vkOrderMenu.js';
import { serverLocalTomorrowISO } from './vkOrderDates.js';
import { loadBranchesAndVkForced } from './vkBranchResolve.js';
import { getCurrentVkMenuDailyItem, formatVkMenuMessage } from './vkMenuContent.js';
import * as VkMsg from './messages/vkBotRu.js';

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @returns {Promise<{
 *   text: string,
 *   rowCount: number,
 *   branchId: string | null,
 *   branchName: string | null,
 *   deliveryDate: string,
 *   branchResolution: string,
 *   menuContentItemId: string | null,
 *   primarySource: 'MenuDayItem',
 *   contentSupplementAppended: boolean,
 *   multiBranchMenuBlocked: boolean
 * }>}
 */
export async function buildVkPrimaryMenuFromCrm(prisma) {
  const deliveryDate = serverLocalTomorrowISO();
  const { branches, forced } = await loadBranchesAndVkForced(prisma);

  if (!branches.length) {
    return {
      text: VkMsg.MSG_MENU_NO_BRANCH,
      rowCount: 0,
      branchId: null,
      branchName: null,
      deliveryDate,
      branchResolution: 'none',
      menuContentItemId: null,
      primarySource: 'MenuDayItem',
      contentSupplementAppended: false,
      multiBranchMenuBlocked: false
    };
  }

  if (branches.length > 1 && !forced) {
    return {
      text: VkMsg.MSG_MENU_MULTI_BRANCH_HINT,
      rowCount: 0,
      branchId: null,
      branchName: null,
      deliveryDate,
      branchResolution: 'multi_branch_pick_required',
      menuContentItemId: null,
      primarySource: 'MenuDayItem',
      contentSupplementAppended: false,
      multiBranchMenuBlocked: true
    };
  }

  const branch = forced || branches[0];
  const rows = await loadOrderableMenuRows(prisma, branch.id, deliveryDate);
  const lines = rows.map((r) => {
    const rub = (Number(r.price) / 100).toLocaleString('ru-RU', { maximumFractionDigits: 0 });
    return `${r.position}. ${String(r.name).trim()} — ${rub} ₽`;
  });
  const listBlock = lines.join('\n');

  let main;
  if (!rows.length) {
    main = VkMsg.MSG_MENU_EMPTY_CRM(branch.name, deliveryDate);
  } else {
    main = VkMsg.MSG_MENU_CRM_PRIMARY(branch.name, deliveryDate, listBlock);
  }

  let menuContentItemId = null;
  let supplement = '';
  const append = (process.env.POLDEN_VK_APPEND_MENU_DAILY || '').trim() === '1';
  if (append) {
    const item = await getCurrentVkMenuDailyItem(prisma);
    if (item) {
      menuContentItemId = item.id;
      supplement = `\n\n${VkMsg.MSG_MENU_OPTIONAL_CONTENT_SEPARATOR}\n${formatVkMenuMessage(item)}`;
    }
  }

  const defId = (process.env.POLDEN_VK_DEFAULT_BRANCH_ID || '').trim();
  const probeId = (process.env.POLDEN_VK_ORDER_PROBE_BRANCH_ID || '').trim();
  let branchResolution = 'single_branch';
  if (branches.length > 1) {
    if (defId && branch.id === defId) branchResolution = 'POLDEN_VK_DEFAULT_BRANCH_ID';
    else if (probeId && branch.id === probeId) branchResolution = 'POLDEN_VK_ORDER_PROBE_BRANCH_ID';
    else branchResolution = 'forced';
  }

  return {
    text: `${main}${supplement}`.trim(),
    rowCount: rows.length,
    branchId: branch.id,
    branchName: branch.name,
    deliveryDate,
    branchResolution,
    menuContentItemId,
    primarySource: 'MenuDayItem',
    contentSupplementAppended: Boolean(supplement),
    multiBranchMenuBlocked: false
  };
}
