/**
 * Обработка входящих сообщений VK (лид-форма, меню из CRM, структурированный заказ).
 */

import { getCurrentVkMenuDailyItem, formatVkMenuMessage } from './vkMenuContent.js';
import { vkMainKeyboardJson, vkSendMessage } from './vkSend.js';
import * as VkMsg from './messages/vkBotRu.js';
import { processVkStructuredOrderFlow, startVkStructuredOrder, isStructuredOrderState } from './vkOrderHandler.js';

const STATES = {
  IDLE: 'IDLE',
  COLLECT_NAME: 'COLLECT_NAME',
  COLLECT_PHONE: 'COLLECT_PHONE',
  COLLECT_ADDRESS: 'COLLECT_ADDRESS',
  COLLECT_DATE: 'COLLECT_DATE',
  COLLECT_COMMENT: 'COLLECT_COMMENT'
};

function normalizePhoneRu(raw) {
  let d = String(raw || '').replace(/\D/g, '').replace(/^8/, '7');
  if (!d.startsWith('7')) d = '7' + d;
  return d.slice(0, 11);
}

function isValidRuPhone(normalized) {
  return normalized.length === 11 && normalized.startsWith('7');
}

function normCmd(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/ё/g, 'е');
}

const KB = vkMainKeyboardJson();

const OPERATOR_HINT = process.env.VK_OPERATOR_CONTACT_TEXT || VkMsg.VK_BOT_DEFAULT_OPERATOR_HINT;

function isLeadCollectionState(s) {
  return (
    s === STATES.COLLECT_NAME ||
    s === STATES.COLLECT_PHONE ||
    s === STATES.COLLECT_ADDRESS ||
    s === STATES.COLLECT_DATE ||
    s === STATES.COLLECT_COMMENT
  );
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {{ peer_id: number, from_id: number, text?: string }} message
 * @param {unknown} rawObjectForAudit
 */
export async function handleVkIncomingMessage(prisma, message, rawObjectForAudit) {
  const peerId = String(message.peer_id);
  const vkUserId = String(message.from_id);
  const text = (message.text || '').trim();

  let state = await prisma.vkConversationState.findUnique({ where: { peerId } });
  if (!state) {
    state = await prisma.vkConversationState.create({
      data: { peerId, vkUserId, currentState: STATES.IDLE }
    });
  } else if (state.vkUserId !== vkUserId) {
    await prisma.vkConversationState.update({
      where: { peerId },
      data: { vkUserId }
    });
  }

  const cmd = normCmd(text);

  if (cmd === 'отмена' || cmd === 'cancel') {
    await prisma.vkConversationState.update({
      where: { peerId },
      data: {
        currentState: STATES.IDLE,
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
    await vkSendMessage(peerId, VkMsg.MSG_LEAD_CANCELLED, { keyboardJson: KB });
    return;
  }

  const so = await processVkStructuredOrderFlow(prisma, {
    peerId,
    vkUserId,
    text,
    cmd,
    state,
    rawObjectForAudit,
    normCmd,
    vkSendMessage,
    keyboardJson: KB,
    operatorHint: OPERATOR_HINT
  });
  if (so.handled) return;

  // Перечитать состояние после возможных обновлений внутри structured (не должно сработать для IDLE)
  if (isStructuredOrderState(state.currentState)) {
    state = await prisma.vkConversationState.findUnique({ where: { peerId } });
    if (!state) return;
  }

  const wantStructuredOrder =
    text === 'Оформить заказ' ||
    cmd.includes('оформить заказ') ||
    cmd === 'сделать заказ' ||
    cmd.includes('сделать заказ');

  const wantMenu =
    cmd === 'меню' ||
    cmd === 'menu' ||
    text === 'Меню' ||
    normCmd(text.replace(/[.!?]+$/, '')) === 'меню';
  const wantLead =
    cmd.includes('оставить заявку') ||
    cmd === 'заявка' ||
    text === 'Оставить заявку' ||
    cmd.includes('заявку');
  const wantOperator =
    cmd.includes('связаться') ||
    cmd.includes('оператор') ||
    text === 'Связаться с оператором' ||
    cmd.includes('связаться с оператором');

  if (state.currentState === STATES.IDLE || wantMenu || wantLead || wantOperator || wantStructuredOrder) {
    // «Оформить заказ» раньше срабатывало только из IDLE: из сценария лида текст шёл в имя/телефон и
    // заканчивался MSG_LEAD_ACCEPTED — сбрасываем черновик заявки и открываем структурированный заказ.
    if (wantStructuredOrder && (state.currentState === STATES.IDLE || isLeadCollectionState(state.currentState))) {
      if (isLeadCollectionState(state.currentState)) {
        await prisma.vkConversationState.update({
          where: { peerId },
          data: {
            currentState: STATES.IDLE,
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
      }
      await startVkStructuredOrder(prisma, peerId, vkUserId, vkSendMessage, KB);
      return;
    }
    if (wantMenu) {
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
        data: { currentState: STATES.IDLE, menuContentItemId: menuId }
      });
      await vkSendMessage(peerId, `${reply}\n\n${VkMsg.MSG_MENU_FOOTER}`, { keyboardJson: KB });
      return;
    }
    if (wantOperator) {
      await prisma.vkConversationState.update({ where: { peerId }, data: { currentState: STATES.IDLE } });
      await vkSendMessage(peerId, OPERATOR_HINT, { keyboardJson: KB });
      return;
    }
    if (wantLead) {
      await prisma.vkConversationState.update({
        where: { peerId },
        data: { currentState: STATES.COLLECT_NAME }
      });
      await vkSendMessage(peerId, VkMsg.MSG_ASK_NAME, { keyboardJson: null });
      return;
    }
  }

  switch (state.currentState) {
    case STATES.COLLECT_NAME: {
      if (!text || text.length < 2) {
        await vkSendMessage(peerId, VkMsg.MSG_NAME_TOO_SHORT, { keyboardJson: null });
        return;
      }
      await prisma.vkConversationState.update({
        where: { peerId },
        data: { draftName: text.slice(0, 200), currentState: STATES.COLLECT_PHONE }
      });
      await vkSendMessage(peerId, VkMsg.MSG_ASK_PHONE, { keyboardJson: null });
      return;
    }
    case STATES.COLLECT_PHONE: {
      const p = normalizePhoneRu(text);
      if (!isValidRuPhone(p)) {
        await vkSendMessage(peerId, VkMsg.MSG_PHONE_INVALID, { keyboardJson: null });
        return;
      }
      await prisma.vkConversationState.update({
        where: { peerId },
        data: { draftPhone: p, currentState: STATES.COLLECT_ADDRESS }
      });
      await vkSendMessage(peerId, VkMsg.MSG_ASK_ADDRESS, { keyboardJson: null });
      return;
    }
    case STATES.COLLECT_ADDRESS: {
      if (!text || text.length < 3) {
        await vkSendMessage(peerId, VkMsg.MSG_ADDRESS_TOO_SHORT, { keyboardJson: null });
        return;
      }
      await prisma.vkConversationState.update({
        where: { peerId },
        data: { draftAddress: text.slice(0, 500), currentState: STATES.COLLECT_DATE }
      });
      await vkSendMessage(peerId, VkMsg.MSG_ASK_DELIVERY_DATE, { keyboardJson: null });
      return;
    }
    case STATES.COLLECT_DATE: {
      if (!text) {
        await vkSendMessage(peerId, VkMsg.MSG_DATE_EMPTY, { keyboardJson: null });
        return;
      }
      await prisma.vkConversationState.update({
        where: { peerId },
        data: { draftRequestedDateText: text.slice(0, 200), currentState: STATES.COLLECT_COMMENT }
      });
      await vkSendMessage(peerId, VkMsg.MSG_ASK_COMMENT, { keyboardJson: null });
      return;
    }
    case STATES.COLLECT_COMMENT: {
      const comment = text === '-' ? '' : text.slice(0, 2000);
      const fresh = await prisma.vkConversationState.findUnique({ where: { peerId } });
      if (!fresh) return;
      const campaign = fresh.menuContentItemId
        ? (
            await prisma.contentItem.findUnique({
              where: { id: fresh.menuContentItemId },
              select: { utmCampaign: true }
            })
          )?.utmCampaign || null
        : null;

      await prisma.vkLead.create({
        data: {
          vkUserId,
          peerId,
          name: fresh.draftName.trim(),
          phone: fresh.draftPhone,
          address: fresh.draftAddress.trim(),
          requestedDateText: fresh.draftRequestedDateText.trim(),
          comment,
          status: 'NEW',
          rawPayloadJson: JSON.stringify(rawObjectForAudit).slice(0, 16000),
          menuContentItemId: fresh.menuContentItemId,
          attributionCampaign: campaign ? String(campaign).slice(0, 256) : null
        }
      });

      await prisma.vkConversationState.update({
        where: { peerId },
        data: {
          currentState: STATES.IDLE,
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

      await vkSendMessage(peerId, VkMsg.MSG_LEAD_ACCEPTED, { keyboardJson: KB });
      return;
    }
    default:
      break;
  }

  if (state.currentState === STATES.IDLE) {
    await vkSendMessage(peerId, VkMsg.MSG_IDLE_CHOOSE, { keyboardJson: KB });
  }
}
