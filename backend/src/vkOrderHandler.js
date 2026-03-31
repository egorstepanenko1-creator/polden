/**
 * Структурированный заказ VK → DeliveryOrder через createDeliveryOrderFromInput.
 * При сбое меню/парсинга — сообщение пользователю + возможность «Оставить заявку».
 */

import { computeQuoteKopeks } from './pricing.js';
import { createDeliveryOrderFromInput, normalizePhone } from './deliveryOrderService.js';
import { parseVkCartLine } from './vkCartParse.js';
import { loadOrderableMenuRows, formatVkOrderableMenuText } from './vkOrderMenu.js';
import { serverLocalTomorrowISO } from './vkOrderDates.js';
import { getCurrentVkMenuDailyItem, formatVkMenuMessage } from './vkMenuContent.js';
import * as VkMsg from './messages/vkBotRu.js';

export const ORDER_STATES = {
  PICK_BRANCH: 'ORDER_PICK_BRANCH',
  AWAIT_ITEMS: 'ORDER_AWAIT_ITEMS',
  REVIEW: 'ORDER_REVIEW',
  C_NAME: 'ORDER_C_NAME',
  C_PHONE: 'ORDER_C_PHONE',
  C_ADDR: 'ORDER_C_ADDR',
  C_COMMENT: 'ORDER_C_COMMENT'
};

const ALL_ORDER = new Set(Object.values(ORDER_STATES));

export function isStructuredOrderState(s) {
  return ALL_ORDER.has(String(s || ''));
}

function rubK(kopeks) {
  return (Number(kopeks) / 100).toLocaleString('ru-RU', { maximumFractionDigits: 0 });
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} peerId
 */
async function clearOrderDraft(prisma, peerId) {
  await prisma.vkConversationState.update({
    where: { peerId },
    data: {
      draftBranchId: null,
      draftDeliveryDate: null,
      draftCartJson: '[]'
    }
  });
}

function buildVkOrderAttribution(peerId, vkUserId) {
  return JSON.stringify({
    utm_source: 'vk',
    utm_medium: 'bot',
    order_capture: 'vk_direct_v1',
    vk_peer_id: String(peerId),
    vk_user_id: String(vkUserId)
  });
}

/**
 * Старт потока заказа из IDLE.
 * @param {import('@prisma/client').PrismaClient} prisma
 */
export async function startVkStructuredOrder(prisma, peerId, vkUserId, vkSendMessage, keyboardJson) {
  const branches = await prisma.branch.findMany({ orderBy: { name: 'asc' } });
  if (!branches.length) {
    await vkSendMessage(
      peerId,
      `${VkMsg.MSG_ORDER_NO_BRANCHES}\n\n${VkMsg.MSG_ORDER_FALLBACK_LEAD}`,
      { keyboardJson }
    );
    return;
  }

  const tomorrow = serverLocalTomorrowISO();

  const forcedBranchId = (process.env.POLDEN_VK_DEFAULT_BRANCH_ID || '').trim();
  if (forcedBranchId) {
    const forced = branches.find((b) => b.id === forcedBranchId);
    if (forced) {
      const rows = await loadOrderableMenuRows(prisma, forced.id, tomorrow);
      if (!rows.length) {
        await vkSendMessage(
          peerId,
          `${VkMsg.MSG_ORDER_MENU_EMPTY}\n\n${VkMsg.MSG_ORDER_FALLBACK_LEAD}`,
          { keyboardJson }
        );
        return;
      }
      const menuText = formatVkOrderableMenuText(rows);
      await prisma.vkConversationState.update({
        where: { peerId },
        data: {
          currentState: ORDER_STATES.AWAIT_ITEMS,
          draftBranchId: forced.id,
          draftDeliveryDate: tomorrow,
          draftCartJson: '[]'
        }
      });
      await vkSendMessage(
        peerId,
        `${VkMsg.MSG_ORDER_INTRO_SINGLE_BRANCH(forced.name, tomorrow)}\n\n${menuText}\n\n${VkMsg.MSG_ORDER_ITEMS_HINT}`,
        { keyboardJson: null }
      );
      return;
    }
  }

  if (branches.length === 1) {
    const b = branches[0];
    const rows = await loadOrderableMenuRows(prisma, b.id, tomorrow);
    if (!rows.length) {
      await vkSendMessage(
        peerId,
        `${VkMsg.MSG_ORDER_MENU_EMPTY}\n\n${VkMsg.MSG_ORDER_FALLBACK_LEAD}`,
        { keyboardJson }
      );
      return;
    }
    const menuText = formatVkOrderableMenuText(rows);
    await prisma.vkConversationState.update({
      where: { peerId },
      data: {
        currentState: ORDER_STATES.AWAIT_ITEMS,
        draftBranchId: b.id,
        draftDeliveryDate: tomorrow,
        draftCartJson: '[]'
      }
    });
    await vkSendMessage(
      peerId,
      `${VkMsg.MSG_ORDER_INTRO_SINGLE_BRANCH(b.name, tomorrow)}\n\n${menuText}\n\n${VkMsg.MSG_ORDER_ITEMS_HINT}`,
      { keyboardJson: null }
    );
    return;
  }

  const list = branches.map((br, i) => `${i + 1}) ${br.name}`).join('\n');
  await prisma.vkConversationState.update({
    where: { peerId },
    data: {
      currentState: ORDER_STATES.PICK_BRANCH,
      draftDeliveryDate: tomorrow,
      draftBranchId: null,
      draftCartJson: '[]'
    }
  });
  await vkSendMessage(
    peerId,
    `${VkMsg.MSG_ORDER_PICK_BRANCH(list, tomorrow)}\n\n${VkMsg.MSG_ORDER_BRANCH_HINT}`,
    { keyboardJson: null }
  );
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {{
 *   peerId: string,
 *   vkUserId: string,
 *   text: string,
 *   cmd: string,
 *   state: import('@prisma/client').VkConversationState,
 *   rawObjectForAudit: unknown,
 *   normCmd: (s: string) => string,
 *   vkSendMessage: (peerId: string, text: string, opts?: { keyboardJson?: string | null }) => Promise<unknown>,
 *   keyboardJson: string,
 *   operatorHint: string
 * }} ctx
 * @returns {Promise<{ handled: boolean, passToIdleHandlers?: boolean }>}
 */
export async function processVkStructuredOrderFlow(prisma, ctx) {
  const { peerId, vkUserId, text, cmd, state, rawObjectForAudit, normCmd, vkSendMessage, keyboardJson, operatorHint } =
    ctx;

  if (!isStructuredOrderState(state.currentState)) {
    return { handled: false };
  }

  const O = ORDER_STATES;

  const wantLead =
    cmd.includes('оставить заявку') ||
    cmd === 'заявка' ||
    text === 'Оставить заявку' ||
    cmd.includes('заявку');
  const wantMenu =
    cmd === 'меню' ||
    cmd === 'menu' ||
    text === 'Меню' ||
    normCmd(text.replace(/[.!?]+$/, '')) === 'меню';
  const wantOperator =
    cmd.includes('связаться') ||
    cmd.includes('оператор') ||
    text === 'Связаться с оператором';

  if (wantLead) {
    await clearOrderDraft(prisma, peerId);
    await prisma.vkConversationState.update({
      where: { peerId },
      data: {
        currentState: 'COLLECT_NAME',
        draftName: '',
        draftPhone: '',
        draftAddress: '',
        draftRequestedDateText: '',
        draftComment: ''
      }
    });
    await vkSendMessage(peerId, VkMsg.MSG_ASK_NAME, { keyboardJson: null });
    return { handled: true };
  }
  if (wantOperator) {
    await clearOrderDraft(prisma, peerId);
    await prisma.vkConversationState.update({ where: { peerId }, data: { currentState: 'IDLE' } });
    await vkSendMessage(peerId, operatorHint, { keyboardJson });
    return { handled: true };
  }
  if (wantMenu) {
    await clearOrderDraft(prisma, peerId);
    await prisma.vkConversationState.update({ where: { peerId }, data: { currentState: 'IDLE' } });
    const item = await getCurrentVkMenuDailyItem(prisma);
    let reply;
    let menuId = null;
    if (item) {
      reply = formatVkMenuMessage(item);
      menuId = item.id;
    } else {
      reply = VkMsg.MSG_MENU_EMPTY;
    }
    await prisma.vkConversationState.update({
      where: { peerId },
      data: { menuContentItemId: menuId }
    });
    await vkSendMessage(peerId, `${reply}\n\n${VkMsg.MSG_MENU_FOOTER}`, { keyboardJson });
    return { handled: true };
  }

  switch (state.currentState) {
    case O.PICK_BRANCH: {
      const n = parseInt(String(text).trim(), 10);
      const branches = await prisma.branch.findMany({ orderBy: { name: 'asc' } });
      if (!Number.isFinite(n) || n < 1 || n > branches.length) {
        await vkSendMessage(peerId, VkMsg.MSG_ORDER_BRANCH_INVALID(branches.length), { keyboardJson: null });
        return { handled: true };
      }
      const b = branches[n - 1];
      const date = state.draftDeliveryDate || serverLocalTomorrowISO();
      const rows = await loadOrderableMenuRows(prisma, b.id, date);
      if (!rows.length) {
        await clearOrderDraft(prisma, peerId);
        await prisma.vkConversationState.update({ where: { peerId }, data: { currentState: 'IDLE' } });
        await vkSendMessage(
          peerId,
          `${VkMsg.MSG_ORDER_MENU_EMPTY}\n\n${VkMsg.MSG_ORDER_FALLBACK_LEAD}`,
          { keyboardJson }
        );
        return { handled: true };
      }
      await prisma.vkConversationState.update({
        where: { peerId },
        data: {
          draftBranchId: b.id,
          draftDeliveryDate: date,
          currentState: O.AWAIT_ITEMS,
          draftCartJson: '[]'
        }
      });
      const menuText = formatVkOrderableMenuText(rows);
      await vkSendMessage(
        peerId,
        `${VkMsg.MSG_ORDER_BRANCH_PICKED(b.name, date)}\n\n${menuText}\n\n${VkMsg.MSG_ORDER_ITEMS_HINT}`,
        { keyboardJson: null }
      );
      return { handled: true };
    }
    case O.AWAIT_ITEMS: {
      if (cmd === 'сброс' || cmd === 'очистить' || cmd === 'reset') {
        await prisma.vkConversationState.update({ where: { peerId }, data: { draftCartJson: '[]' } });
        await vkSendMessage(peerId, VkMsg.MSG_ORDER_CART_CLEARED, { keyboardJson: null });
        return { handled: true };
      }
      const parsed = parseVkCartLine(text);
      if (!parsed.ok) {
        await vkSendMessage(peerId, `${parsed.error}\n\n${VkMsg.MSG_ORDER_ITEMS_HINT}`, { keyboardJson: null });
        return { handled: true };
      }
      const branchId = state.draftBranchId;
      const date = state.draftDeliveryDate;
      if (!branchId || !date) {
        await vkSendMessage(peerId, VkMsg.MSG_ORDER_STATE_BROKEN, { keyboardJson });
        return { handled: true };
      }
      try {
        const q = await computeQuoteKopeks(prisma, branchId, date, parsed.items);
        await prisma.vkConversationState.update({
          where: { peerId },
          data: {
            draftCartJson: JSON.stringify(parsed.items),
            currentState: O.REVIEW
          }
        });
        const summary = parsed.items
          .map((it) => `• поз. ${it.position} × ${it.qty}`)
          .join('\n');
        await vkSendMessage(
          peerId,
          `${VkMsg.MSG_ORDER_REVIEW_HEADER}\n${summary}\n\nИтого: ${rubK(q.totalAmount)} ₽\n\n${VkMsg.MSG_ORDER_REVIEW_CONFIRM}`,
          { keyboardJson: null }
        );
      } catch (e) {
        await vkSendMessage(
          peerId,
          `${VkMsg.MSG_ORDER_QUOTE_FAIL(String(e.message || e))}\n\n${VkMsg.MSG_ORDER_ITEMS_HINT}\n${VkMsg.MSG_ORDER_FALLBACK_LEAD}`,
          { keyboardJson: null }
        );
      }
      return { handled: true };
    }
    case O.REVIEW: {
      const confirm =
        cmd === 'да' ||
        cmd === 'ок' ||
        cmd === 'ok' ||
        cmd === 'подтвердить' ||
        cmd === 'подтверждаю' ||
        cmd === '+';
      const back =
        cmd === 'назад' ||
        cmd === 'изменить' ||
        cmd === 'сброс' ||
        cmd === 'очистить';

      if (back) {
        await prisma.vkConversationState.update({ where: { peerId }, data: { currentState: O.AWAIT_ITEMS } });
        await vkSendMessage(peerId, VkMsg.MSG_ORDER_BACK_TO_ITEMS, { keyboardJson: null });
        return { handled: true };
      }
      if (confirm) {
        await prisma.vkConversationState.update({ where: { peerId }, data: { currentState: O.C_NAME } });
        await vkSendMessage(peerId, VkMsg.MSG_ORDER_ASK_NAME, { keyboardJson: null });
        return { handled: true };
      }
      const reparsed = parseVkCartLine(text);
      if (reparsed.ok) {
        const branchId = state.draftBranchId;
        const date = state.draftDeliveryDate;
        if (!branchId || !date) return { handled: true };
        try {
          const q = await computeQuoteKopeks(prisma, branchId, date, reparsed.items);
          await prisma.vkConversationState.update({
            where: { peerId },
            data: { draftCartJson: JSON.stringify(reparsed.items) }
          });
          const summary = reparsed.items.map((it) => `• поз. ${it.position} × ${it.qty}`).join('\n');
          await vkSendMessage(
            peerId,
            `${VkMsg.MSG_ORDER_REVIEW_HEADER}\n${summary}\n\nИтого: ${rubK(q.totalAmount)} ₽\n\n${VkMsg.MSG_ORDER_REVIEW_CONFIRM}`,
            { keyboardJson: null }
          );
        } catch (e) {
          await vkSendMessage(
            peerId,
            `${VkMsg.MSG_ORDER_QUOTE_FAIL(String(e.message || e))}\n\n${VkMsg.MSG_ORDER_REVIEW_CONFIRM}`,
            { keyboardJson: null }
          );
        }
        return { handled: true };
      }
      await vkSendMessage(peerId, VkMsg.MSG_ORDER_REVIEW_UNCLEAR, { keyboardJson: null });
      return { handled: true };
    }
    case O.C_NAME: {
      if (!text || text.length < 2) {
        await vkSendMessage(peerId, VkMsg.MSG_NAME_TOO_SHORT, { keyboardJson: null });
        return { handled: true };
      }
      await prisma.vkConversationState.update({
        where: { peerId },
        data: { draftName: text.slice(0, 200), currentState: O.C_PHONE }
      });
      await vkSendMessage(peerId, VkMsg.MSG_ASK_PHONE, { keyboardJson: null });
      return { handled: true };
    }
    case O.C_PHONE: {
      const p = normalizePhone(text);
      if (p.length < 11) {
        await vkSendMessage(peerId, VkMsg.MSG_PHONE_INVALID, { keyboardJson: null });
        return { handled: true };
      }
      await prisma.vkConversationState.update({
        where: { peerId },
        data: { draftPhone: p, currentState: O.C_ADDR }
      });
      await vkSendMessage(peerId, VkMsg.MSG_ASK_ADDRESS, { keyboardJson: null });
      return { handled: true };
    }
    case O.C_ADDR: {
      if (!text || text.length < 3) {
        await vkSendMessage(peerId, VkMsg.MSG_ADDRESS_TOO_SHORT, { keyboardJson: null });
        return { handled: true };
      }
      await prisma.vkConversationState.update({
        where: { peerId },
        data: { draftAddress: text.slice(0, 500), currentState: O.C_COMMENT }
      });
      await vkSendMessage(peerId, VkMsg.MSG_ORDER_ASK_COMMENT, { keyboardJson: null });
      return { handled: true };
    }
    case O.C_COMMENT: {
      const comment = text === '-' ? '' : text.slice(0, 2000);
      const fresh = await prisma.vkConversationState.findUnique({ where: { peerId } });
      if (!fresh?.draftBranchId || !fresh.draftDeliveryDate) {
        await vkSendMessage(peerId, VkMsg.MSG_ORDER_STATE_BROKEN, { keyboardJson });
        return { handled: true };
      }
      let items;
      try {
        items = JSON.parse(fresh.draftCartJson || '[]');
        if (!Array.isArray(items) || items.length === 0) throw new Error('empty cart');
      } catch {
        await vkSendMessage(peerId, VkMsg.MSG_ORDER_STATE_BROKEN, { keyboardJson });
        return { handled: true };
      }

      const attributionJson = buildVkOrderAttribution(peerId, vkUserId);

      try {
        const order = await createDeliveryOrderFromInput(prisma, {
          branchId: fresh.draftBranchId,
          deliveryDate: fresh.draftDeliveryDate,
          customerName: fresh.draftName.trim(),
          customerPhone: fresh.draftPhone,
          items,
          address: fresh.draftAddress.trim(),
          comment: comment || null,
          paymentType: null,
          attributionJson,
          status: 'NEW',
          sourceChannel: 'VK',
          linkVkLeadId: null
        });

        await prisma.vkConversationState.update({
          where: { peerId },
          data: {
            currentState: 'IDLE',
            draftName: '',
            draftPhone: '',
            draftAddress: '',
            draftRequestedDateText: '',
            draftComment: '',
            draftBranchId: null,
            draftDeliveryDate: null,
            draftCartJson: '[]'
          }
        });

        const rub = rubK(order.totalAmount);
        const lines = items.map((it) => `поз.${it.position}×${it.qty}`).join(', ');
        await vkSendMessage(
          peerId,
          VkMsg.MSG_ORDER_CREATED(order.id, rub, lines, fresh.draftDeliveryDate),
          { keyboardJson }
        );
      } catch (e) {
        await vkSendMessage(
          peerId,
          `${VkMsg.MSG_ORDER_CREATE_FAIL(String(e.message || e))}\n\n${VkMsg.MSG_ORDER_FALLBACK_LEAD}`,
          { keyboardJson }
        );
      }
      return { handled: true };
    }
    default:
      return { handled: false };
  }
}
