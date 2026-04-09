/**
 * Обработка входящих сообщений VK (лид-форма, меню из CRM, структурированный заказ).
 */

import { buildVkPrimaryMenuFromCrm } from './vkMenuFromCrm.js';
import { vkMainKeyboardJson, vkSendMessage } from './vkSend.js';
import * as VkMsg from './messages/vkBotRu.js';
import { processVkStructuredOrderFlow, startVkStructuredOrder, isStructuredOrderState } from './vkOrderHandler.js';

const STATES = {
  IDLE: 'IDLE',
  COLLECT_NAME: 'COLLECT_NAME',
  COLLECT_PHONE: 'COLLECT_PHONE',
  COLLECT_ADDRESS: 'COLLECT_ADDRESS',
  COLLECT_DATE: 'COLLECT_DATE',
  COLLECT_COMMENT: 'COLLECT_COMMENT',
  AWAIT_CANCEL_CONFIRM: 'AWAIT_CANCEL_CONFIRM'
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

/** Повторная доставка одного и того же message_new от VK → два ответа; отсекаем по id. */
const vkInboundDedup = new Map();
const VK_DEDUP_MS = 25_000;
function pruneVkDedup() {
  const now = Date.now();
  if (vkInboundDedup.size < 3000) return;
  for (const [k, t] of vkInboundDedup) {
    if (now - t > VK_DEDUP_MS * 2) vkInboundDedup.delete(k);
  }
}
/**
 * @param {string} peerId
 * @param {{ id?: number, conversation_message_id?: number }} message
 */
function isDuplicateVkInbound(peerId, message) {
  const mid = message.conversation_message_id ?? message.id;
  if (mid === undefined || mid === null) return false;
  pruneVkDedup();
  const key = `${peerId}:${mid}`;
  const now = Date.now();
  const prev = vkInboundDedup.get(key);
  if (prev !== undefined && now - prev < VK_DEDUP_MS) {
    console.warn('[vk] skip duplicate webhook for same message id', { peerId, messageId: mid });
    return true;
  }
  vkInboundDedup.set(key, now);
  return false;
}

function isLeadCollectionState(s) {
  return (
    s === STATES.COLLECT_NAME ||
    s === STATES.COLLECT_PHONE ||
    s === STATES.COLLECT_ADDRESS ||
    s === STATES.COLLECT_DATE ||
    s === STATES.COLLECT_COMMENT
  );
}

async function findTodaysActiveOrder(prisma, peerId) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return prisma.deliveryOrder.findFirst({
    where: {
      attributionJson: { contains: peerId },
      status: { in: ['NEW', 'CONFIRMED'] },
      createdAt: { gte: today, lt: tomorrow }
    },
    include: { items: true },
    orderBy: { createdAt: 'desc' }
  });
}

async function formatOrderSummary(prisma, order) {
  let nameMap = new Map();
  if (prisma && order.branchId && order.deliveryDate) {
    try {
      const rows = await prisma.menuDayItem.findMany({
        where: { branchId: order.branchId, date: order.deliveryDate },
        select: { position: true, name: true }
      });
      nameMap = new Map(rows.map(r => [r.position, r.name]));
    } catch {}
  }
  const itemLines = (order.items || []).map(i => {
    const name = nameMap.get(i.position) || ('поз. ' + i.position);
    return '  • ' + name + (i.qty > 1 ? ' ×' + i.qty : '');
  }).join('\n') || '  (пусто)';
  const statusMap = { NEW: 'Новый', CONFIRMED: 'Подтверждён', KITCHEN: 'На кухне', DELIVERING: 'Доставляется', DONE: 'Доставлен', CANCELED: 'Отменён' };
  const status = statusMap[order.status] || order.status;
  const feeK = order.deliveryFeeKopeks || 0;
  const subK = order.itemsSubtotalKopeks || 0;
  let totalStr;
  if (feeK > 0 && subK > 0) {
    totalStr = 'Доставка: ' + Math.round(feeK / 100) + ' руб.\nСумма заказа: ' + Math.round(subK / 100) + ' руб.\nИтого: ' + Math.round(order.totalAmount / 100) + ' руб.';
  } else {
    totalStr = 'Итого: ' + (order.totalAmount ? Math.round(order.totalAmount / 100) + ' руб. (доставка бесплатно)' : '—');
  }
  return '📦 Заказ на ' + (order.deliveryDate || '—') + '\n' + itemLines + '\n' + totalStr + '\nАдрес: ' + (order.address || '—') + '\nСтатус: ' + status;
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

  if (isDuplicateVkInbound(peerId, message)) return;

  let state = await prisma.vkConversationState.findUnique({ where: { peerId } });
  const isNewUser = !state;
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

  // Приветствие для новых пользователей
  if (isNewUser) {
    await vkSendMessage(
      peerId,
      'Привет! 👋 Готовые обеды с доставкой в Чебаркуле.\n\n' +
      'Принимаем заказы до 21:00, доставляем с 11:30 до 14:00.\n' +
      'Доставка бесплатная от 400 руб.\n\n' +
      'Нажмите «Оформить заказ 🍱» — займёт 1 минуту.',
      { keyboardJson: KB }
    );
    return;
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
        draftCartJson: '[]',
        draftVkGuideJson: '{}'
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
    text === 'Оформить заказ' || text === 'Заказать 🍱' || text === 'Собрать свой обед 🍱' ||
    cmd === 'заказать' || cmd === 'собрать свой обед' ||
    cmd.includes('оформить заказ') || cmd.includes('собрать обед') ||
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
    cmd.includes('связаться с оператором') || text === 'Помощь';
  const wantMyOrder = cmd === 'мой заказ' || cmd === 'статус' || cmd === 'статус заказа' || text === 'Мой заказ';
  const wantCancelOrder = cmd === 'отменить заказ' || cmd === 'отмена заказа' || cmd === 'удалить заказ' || text === 'Отменить заказ';
  const wantEditOrder = cmd === 'изменить заказ' || cmd === 'изменить' || text === 'Изменить заказ';

  if (wantMyOrder || wantCancelOrder || wantEditOrder) {
    const activeOrder = await findTodaysActiveOrder(prisma, peerId);
    if (!activeOrder) {
      await vkSendMessage(peerId, 'Активных заказов на сегодня не найдено.', { keyboardJson: KB });
      return;
    }
    if (wantMyOrder) {
      const myOrderKb = JSON.stringify({
        one_time: false, inline: false,
        buttons: [
          [{ action: { type: 'text', label: 'Изменить заказ', payload: '{}' }, color: 'secondary' },
           { action: { type: 'text', label: 'Отменить заказ', payload: '{}' }, color: 'negative' }]
        ]
      });
      await vkSendMessage(peerId, await formatOrderSummary(prisma, activeOrder), { keyboardJson: myOrderKb });
      return;
    }
    if (wantCancelOrder) {
      await prisma.vkConversationState.update({
        where: { peerId },
        data: { currentState: STATES.AWAIT_CANCEL_CONFIRM, draftComment: String(activeOrder.id) }
      });
      const cancelKb = JSON.stringify({
        one_time: true, inline: false,
        buttons: [
          [{ action: { type: 'text', label: 'Да, отменить', payload: '{"confirmCancel":true}' }, color: 'negative' }],
          [{ action: { type: 'text', label: 'Нет, оставить', payload: '{"confirmCancel":false}' }, color: 'positive' }]
        ]
      });
      await vkSendMessage(peerId,
        (await formatOrderSummary(prisma, activeOrder)) + '\n\nОтменить этот заказ?',
        { keyboardJson: cancelKb }
      );
      return;
    }
    if (wantEditOrder) {
      await prisma.deliveryOrder.update({ where: { id: activeOrder.id }, data: { status: 'CANCELED' } });
      await prisma.vkConversationState.update({
        where: { peerId },
        data: { currentState: STATES.IDLE, draftComment: '' }
      });
      await vkSendMessage(peerId, 'Старый заказ отменён. Собираем новый:', { keyboardJson: null });
      await startVkStructuredOrder(prisma, peerId, vkUserId, vkSendMessage, KB);
      return;
    }
  }

  if (state.currentState === STATES.IDLE || wantMenu || wantLead || wantOperator || wantStructuredOrder) {
    // «Оформить заказ» раньше срабатывало только из IDLE: из сценария лида текст шёл в имя/телефон и
    // заканчивался MSG_LEAD_ACCEPTED — сбрасываем черновик заявки и открываем структурированный заказ.
    if (wantStructuredOrder && (state.currentState === STATES.IDLE || isLeadCollectionState(state.currentState))) {
      // Если уже есть активный заказ сегодня — показываем его, не начинаем новый
      const existingOrder = await findTodaysActiveOrder(prisma, peerId);
      if (existingOrder) {
        const myOrderKb = JSON.stringify({
          one_time: false, inline: false,
          buttons: [
            [{ action: { type: 'text', label: 'Изменить заказ', payload: '{}' }, color: 'secondary' },
             { action: { type: 'text', label: 'Отменить заказ', payload: '{}' }, color: 'negative' }],
            [{ action: { type: 'text', label: 'Оформить заказ', payload: '{}' }, color: 'primary' }]
          ]
        });
        await vkSendMessage(peerId,
          'У вас уже есть заказ на сегодня:\n\n' + (await formatOrderSummary(prisma, existingOrder)) +
          '\n\nЧтобы изменить — нажмите «Изменить заказ» (старый отменится, оформите новый).\nЧтобы добавить второй заказ — «Оформить заказ».',
          { keyboardJson: myOrderKb }
        );
        return;
      }
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
            draftCartJson: '[]',
            draftVkGuideJson: '{}'
          }
        });
      }
      await startVkStructuredOrder(prisma, peerId, vkUserId, vkSendMessage, KB);
      return;
    }
    if (wantMenu) {
      const built = await buildVkPrimaryMenuFromCrm(prisma);
      await prisma.vkConversationState.update({
        where: { peerId },
        data: { currentState: STATES.IDLE, menuContentItemId: built.menuContentItemId }
      });
      await vkSendMessage(peerId, `${built.text}\n\n${VkMsg.MSG_MENU_FOOTER}`, { keyboardJson: KB });
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
          draftCartJson: '[]',
          draftVkGuideJson: '{}'
        }
      });

      await vkSendMessage(peerId, VkMsg.MSG_LEAD_ACCEPTED, { keyboardJson: KB });
      return;
    }
    case STATES.AWAIT_CANCEL_CONFIRM: {
      const orderId = state.draftComment || '';
      // Читаем payload кнопки
      let payloadData = {};
      try { payloadData = JSON.parse(rawObjectForAudit?.message?.payload || '{}'); } catch {}
      const confirmYes = payloadData.confirmCancel === true || cmd === 'да' || cmd === 'yes';
      await prisma.vkConversationState.update({
        where: { peerId },
        data: { currentState: STATES.IDLE, draftComment: '' }
      });
      if (confirmYes && orderId) {
        await prisma.deliveryOrder.update({ where: { id: orderId }, data: { status: 'CANCELED' } });
        await vkSendMessage(peerId, '✅ Заказ отменён.', { keyboardJson: KB });
      } else {
        await vkSendMessage(peerId, 'Хорошо, заказ остаётся.', { keyboardJson: KB });
      }
      return;
    }
    default:
      break;
  }

  if (state.currentState === STATES.IDLE) {
    // Короткие реакции — не отвечаем
    const SILENT_REPLIES = new Set([
      'спасибо', 'спс', 'благодарю', 'хорошо', 'ок', 'ok', 'понял', 'поняла',
      'понятно', 'пожалуйста', 'пжлст', 'отлично', 'класс', 'супер', 'ясно',
      '👍', '❤️', '🙏', '😊', '🔥'
    ]);
    if (SILENT_REPLIES.has(cmd) || text.length <= 2) return;

    // Пишут числами по-старинке: "1, 3, 5" или "1 3 5" — направляем в заказ
    const looksLikePositions = /^[\d\s,xхXХ]+$/.test(text.trim()) && /\d/.test(text);
    if (looksLikePositions) {
      await vkSendMessage(
        peerId,
        'Вижу позиции меню 😊 Теперь заказ оформляется через бота по шагам — нажмите «Оформить заказ», это займёт минуту.',
        { keyboardJson: KB }
      );
      return;
    }

    // Приветствие или вопрос — направляем к оператору
    await vkSendMessage(peerId, OPERATOR_HINT, { keyboardJson: KB });
  }
}
