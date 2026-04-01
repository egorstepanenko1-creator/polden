/**
 * Структурированный заказ VK → DeliveryOrder через createDeliveryOrderFromInput.
 * Пошаговый выбор категорий + свободный ввод; при сбое — «Оставить заявку».
 */

import { createDeliveryOrderFromInput, normalizePhone } from './deliveryOrderService.js';
import { parseVkCartLine } from './vkCartParse.js';
import { loadOrderableMenuRows } from './vkOrderMenu.js';
import { serverLocalTomorrowISO } from './vkOrderDates.js';
import { loadBranchesAndVkForced } from './vkBranchResolve.js';
import { buildVkPrimaryMenuFromCrm } from './vkMenuFromCrm.js';
import { ORDER_STATES, isStructuredOrderState, VK_GUIDE_STATES } from './vkOrderFlowConstants.js';
import {
  processVkGuideFlow,
  startVkOrderGuide,
  formatVkOrderReviewMessage
} from './vkOrderGuidedFlow.js';
import * as VkMsg from './messages/vkBotRu.js';

export { ORDER_STATES, isStructuredOrderState };

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
      draftCartJson: '[]',
      draftVkGuideJson: '{}'
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
  const { branches, forced } = await loadBranchesAndVkForced(prisma);
  if (!branches.length) {
    await vkSendMessage(
      peerId,
      `${VkMsg.MSG_ORDER_NO_BRANCHES}\n\n${VkMsg.MSG_ORDER_FALLBACK_LEAD}`,
      { keyboardJson }
    );
    return;
  }

  const tomorrow = serverLocalTomorrowISO();

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
    const started = await startVkOrderGuide(prisma, peerId, forced.id, tomorrow, vkSendMessage, forced.name);
    if (!started) {
      await vkSendMessage(
        peerId,
        `${VkMsg.MSG_ORDER_MENU_EMPTY}\n\n${VkMsg.MSG_ORDER_FALLBACK_LEAD}`,
        { keyboardJson }
      );
    }
    return;
  }

  const list = branches.map((br, i) => `${i + 1}) ${br.name}`).join('\n');
  await prisma.vkConversationState.update({
    where: { peerId },
    data: {
      currentState: ORDER_STATES.PICK_BRANCH,
      draftDeliveryDate: tomorrow,
      draftBranchId: null,
      draftCartJson: '[]',
      draftVkGuideJson: '{}'
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
    const built = await buildVkPrimaryMenuFromCrm(prisma);
    await prisma.vkConversationState.update({
      where: { peerId },
      data: { menuContentItemId: built.menuContentItemId }
    });
    await vkSendMessage(peerId, `${built.text}\n\n${VkMsg.MSG_MENU_FOOTER}`, { keyboardJson });
    return { handled: true };
  }

  if (VK_GUIDE_STATES.has(state.currentState)) {
    const gr = await processVkGuideFlow(prisma, { peerId, text, cmd, state, vkSendMessage });
    if (gr.handled) return { handled: true };
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
      const started = await startVkOrderGuide(prisma, peerId, b.id, date, vkSendMessage, b.name);
      if (!started) {
        await clearOrderDraft(prisma, peerId);
        await prisma.vkConversationState.update({ where: { peerId }, data: { currentState: 'IDLE' } });
        await vkSendMessage(
          peerId,
          `${VkMsg.MSG_ORDER_MENU_EMPTY}\n\n${VkMsg.MSG_ORDER_FALLBACK_LEAD}`,
          { keyboardJson }
        );
      }
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
      const formatted = await formatVkOrderReviewMessage(prisma, branchId, date, parsed.items);
      if (!formatted.ok) {
        await vkSendMessage(
          peerId,
          `${VkMsg.MSG_ORDER_QUOTE_FAIL(formatted.error)}\n\n${VkMsg.MSG_ORDER_ITEMS_HINT}\n${VkMsg.MSG_ORDER_FALLBACK_LEAD}`,
          { keyboardJson: null }
        );
        return { handled: true };
      }
      await prisma.vkConversationState.update({
        where: { peerId },
        data: {
          draftCartJson: JSON.stringify(parsed.items),
          currentState: O.REVIEW
        }
      });
      await vkSendMessage(peerId, formatted.text, { keyboardJson: null });
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
        const formatted = await formatVkOrderReviewMessage(prisma, branchId, date, reparsed.items);
        if (!formatted.ok) {
          await vkSendMessage(
            peerId,
            `${VkMsg.MSG_ORDER_QUOTE_FAIL(formatted.error)}\n\n${VkMsg.MSG_ORDER_REVIEW_CONFIRM}`,
            { keyboardJson: null }
          );
          return { handled: true };
        }
        await prisma.vkConversationState.update({
          where: { peerId },
          data: { draftCartJson: JSON.stringify(reparsed.items) }
        });
        await vkSendMessage(peerId, formatted.text, { keyboardJson: null });
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
            draftCartJson: '[]',
            draftVkGuideJson: '{}'
          }
        });

        const subK = order.itemsSubtotalKopeks != null ? order.itemsSubtotalKopeks : order.totalAmount;
        const feeK = order.deliveryFeeKopeks != null ? order.deliveryFeeKopeks : 0;
        const feeLabel = feeK > 0 ? `${rubK(feeK)}` : 'бесплатно';
        const lines = items.map((it) => `поз.${it.position}×${it.qty}`).join(', ');
        await vkSendMessage(
          peerId,
          VkMsg.MSG_ORDER_CREATED(
            order.id,
            { sub: rubK(subK), fee: feeLabel, total: rubK(order.totalAmount) },
            lines,
            fresh.draftDeliveryDate
          ),
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
