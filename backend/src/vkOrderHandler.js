/**
 * Структурированный заказ VK — кнопочный флоу:
 * суп → горячее → салат → допы → проверка → имя → телефон → адрес → готово
 */

import { computeQuoteKopeks } from './pricing.js';
import { createDeliveryOrderFromInput, normalizePhone } from './deliveryOrderService.js';
import { loadOrderableMenuRows } from './vkOrderMenu.js';
import { serverLocalTomorrowISO, isTomorrowWeekendEkb, formatDateWithDow } from './vkOrderDates.js';
import { fetchVkUserName } from './vkSend.js';
import * as VkMsg from './messages/vkBotRu.js';

export const ORDER_STATES = {
  PICK_BRANCH:   'ORDER_PICK_BRANCH',
  GUIDE_SOUP:    'ORDER_GUIDE_SOUP',
  GUIDE_HOT:     'ORDER_GUIDE_HOT',
  GUIDE_SALAD:   'ORDER_GUIDE_SALAD',
  GUIDE_EXTRAS:  'ORDER_GUIDE_EXTRAS',
  REVIEW:        'ORDER_REVIEW',
  C_PHONE:       'ORDER_C_PHONE',
  C_ADDR:        'ORDER_C_ADDR',
  C_COMMENT:     'ORDER_C_COMMENT'
};

const ALL_ORDER = new Set(Object.values(ORDER_STATES));

export function isStructuredOrderState(s) {
  return ALL_ORDER.has(String(s || ''));
}

function rubK(kopeks) {
  return (Number(kopeks) / 100).toLocaleString('ru-RU', { maximumFractionDigits: 0 });
}

async function clearOrderDraft(prisma, peerId) {
  await prisma.vkConversationState.update({
    where: { peerId },
    data: { draftBranchId: null, draftDeliveryDate: null, draftCartJson: '[]', draftVkGuideJson: '{}' }
  });
}

function buildVkOrderAttribution(peerId, vkUserId) {
  return JSON.stringify({
    utm_source: 'vk', utm_medium: 'bot', order_capture: 'vk_direct_v1',
    vk_peer_id: String(peerId), vk_user_id: String(vkUserId)
  });
}

/** Категории позиций меню */
const CATEGORY_SOUP   = [1, 2];
const CATEGORY_HOT    = [3, 4];
const CATEGORY_SALAD  = [5, 6];
const CATEGORY_EXTRAS = [7, 8, 9];

function rowsForCategory(rows, positions) {
  return rows.filter(r => positions.includes(r.position));
}

/** Клавиатура с двумя вариантами на выбор + «Пропустить» */
function buildPickKeyboard(rows, skipLabel = 'Пропустить') {
  const btns = rows.map(r => ({
    action: { type: 'text', label: String(r.name).slice(0, 40), payload: JSON.stringify({ pos: r.position }) },
    color: 'primary'
  }));
  return JSON.stringify({
    one_time: true, inline: false,
    buttons: [btns, [{ action: { type: 'text', label: skipLabel, payload: '{"skip":true}' }, color: 'secondary' }]]
  });
}

/** Клавиатура допов — каждый доп отдельной кнопкой + «Готово» */
function buildExtrasKeyboard(rows) {
  const btns = rows.map(r => [{
    action: { type: 'text', label: String(r.name).slice(0, 40) + ' — ' + rubK(r.price) + '₽', payload: JSON.stringify({ pos: r.position }) },
    color: 'secondary'
  }]);
  btns.push([{ action: { type: 'text', label: 'Готово →', payload: '{"done":true}' }, color: 'positive' }]);
  return JSON.stringify({ one_time: false, inline: false, buttons: btns });
}

/** Клавиатура ревью */
function buildReviewKeyboard() {
  return JSON.stringify({
    one_time: true, inline: false,
    buttons: [
      [{ action: { type: 'text', label: 'Оформить ✅', payload: '{"confirm":true}' }, color: 'positive' }],
      [{ action: { type: 'text', label: 'Добавить ещё блюдо', payload: '{"more":true}' }, color: 'secondary' }],
      [{ action: { type: 'text', label: 'Начать заново', payload: '{"restart":true}' }, color: 'negative' }]
    ]
  });
}

/** Клавиатура с одной кнопкой «Пропустить» */
function buildSkipKeyboard(label = 'Пропустить') {
  return JSON.stringify({
    one_time: true, inline: false,
    buttons: [[{ action: { type: 'text', label, payload: '{"skip":true}' }, color: 'secondary' }]]
  });
}

/** Клавиатура с сохранёнными телефонами + новый */
function buildPhoneKeyboard(phones) {
  const btns = phones.map(p => [{
    action: { type: 'text', label: p, payload: JSON.stringify({ phone: p }) },
    color: 'primary'
  }]);
  btns.push([{ action: { type: 'text', label: 'Другой номер', payload: '{"newPhone":true}' }, color: 'secondary' }]);
  return JSON.stringify({ one_time: true, inline: false, buttons: btns });
}

/** Клавиатура с сохранёнными адресами + новый */
function buildAddrKeyboard(addrs) {
  const btns = addrs.map(a => [{
    action: { type: 'text', label: String(a).slice(0, 40), payload: JSON.stringify({ addr: a }) },
    color: 'primary'
  }]);
  btns.push([{ action: { type: 'text', label: 'Другой адрес', payload: '{"newAddr":true}' }, color: 'secondary' }]);
  return JSON.stringify({ one_time: true, inline: false, buttons: btns });
}

/** Клавиатура управления заказом после создания */
function buildOrderActionsKeyboard() {
  return JSON.stringify({
    one_time: false, inline: false,
    buttons: [
      [{ action: { type: 'text', label: 'Собрать свой обед 🍱', payload: '{}' }, color: 'primary' }],
      [
        { action: { type: 'text', label: 'Мой заказ', payload: '{}' }, color: 'positive' },
        { action: { type: 'text', label: 'Отменить заказ', payload: '{}' }, color: 'negative' }
      ],
      [
        { action: { type: 'text', label: 'Меню', payload: '{}' }, color: 'secondary' },
        { action: { type: 'text', label: 'Помощь', payload: '{}' }, color: 'secondary' }
      ]
    ]
  });
}

/** Найти последние уникальные телефоны и адреса по peerId */
async function getPastContacts(prisma, peerId) {
  const orders = await prisma.deliveryOrder.findMany({
    where: { attributionJson: { contains: peerId } },
    select: { customerPhone: true, address: true },
    orderBy: { createdAt: 'desc' },
    take: 10
  });
  // Нормализуем для дедупликации: trim + lowercase
  const seenPhones = new Set();
  const phones = [];
  for (const o of orders) {
    const p = (o.customerPhone || '').trim();
    if (p && !seenPhones.has(p)) { seenPhones.add(p); phones.push(p); }
    if (phones.length >= 3) break;
  }
  const seenAddrs = new Set();
  const addrs = [];
  for (const o of orders) {
    const a = (o.address || '').trim();
    const key = a.toLowerCase().replace(/\s+/g, ' ');
    if (a && !seenAddrs.has(key)) { seenAddrs.add(key); addrs.push(a); }
    if (addrs.length >= 3) break;
  }
  return { phones, addrs };
}

/** Порядковый номер заказа (кол-во всех заказов) */
async function getOrderSeqNumber(prisma) {
  return await prisma.deliveryOrder.count();
}

/** Сформировать текст корзины с ценами */
async function buildCartSummary(prisma, branchId, date, cart) {
  if (!cart.length) return 'Корзина пустая.';
  const rows = await loadOrderableMenuRows(prisma, branchId, date);
  const nameMap = new Map(rows.map(r => [r.position, r]));
  const lines = cart.map(it => {
    const row = nameMap.get(it.position);
    const name = row ? String(row.name).trim() : 'поз.' + it.position;
    const price = row ? rubK(row.price * it.qty) + ' ₽' : '';
    return `• ${name}${it.qty > 1 ? ' ×' + it.qty : ''}${price ? ' — ' + price : ''}`;
  });
  try {
    const q = await computeQuoteKopeks(prisma, branchId, date, cart);
    const feeStr = q.deliveryFeeKopeks > 0 ? `\nДоставка: ${rubK(q.deliveryFeeKopeks)} ₽` : '\nДоставка бесплатно';
    return lines.join('\n') + feeStr + `\nИтого: ${rubK(q.totalAmount)} ₽`;
  } catch {
    return lines.join('\n');
  }
}

/** Переход к следующему шагу выбора */
async function goToNextStep(prisma, peerId, vkUserId, vkSendMessage, state, rows, fromStep) {
  const cart = JSON.parse(state.draftCartJson || '[]');
  const branchId = state.draftBranchId;
  const date = state.draftDeliveryDate;
  const dateFmt = formatDateWithDow(date);

  if (fromStep === 'soup') {
    const hotRows = rowsForCategory(rows, CATEGORY_HOT);
    if (hotRows.length) {
      await prisma.vkConversationState.update({ where: { peerId }, data: { currentState: ORDER_STATES.GUIDE_HOT } });
      await vkSendMessage(peerId, `Горячее на ${dateFmt}:`, { keyboardJson: buildPickKeyboard(hotRows, 'Пропустить') });
      return;
    }
    fromStep = 'hot';
  }
  if (fromStep === 'hot') {
    const saladRows = rowsForCategory(rows, CATEGORY_SALAD);
    if (saladRows.length) {
      await prisma.vkConversationState.update({ where: { peerId }, data: { currentState: ORDER_STATES.GUIDE_SALAD } });
      await vkSendMessage(peerId, `Салат на ${dateFmt}:`, { keyboardJson: buildPickKeyboard(saladRows, 'Пропустить') });
      return;
    }
    fromStep = 'salad';
  }
  if (fromStep === 'salad') {
    const extraRows = rowsForCategory(rows, CATEGORY_EXTRAS);
    if (extraRows.length) {
      await prisma.vkConversationState.update({ where: { peerId }, data: { currentState: ORDER_STATES.GUIDE_EXTRAS } });
      await vkSendMessage(peerId, 'Дополнительно (по желанию):', { keyboardJson: buildExtrasKeyboard(extraRows) });
      return;
    }
    fromStep = 'extras';
  }
  // Переход к ревью
  await prisma.vkConversationState.update({ where: { peerId }, data: { currentState: ORDER_STATES.REVIEW } });
  const summary = await buildCartSummary(prisma, branchId, date, cart);
  await vkSendMessage(peerId, `Ваш заказ на ${dateFmt}:\n\n${summary}`, { keyboardJson: buildReviewKeyboard() });
}

/** После подтверждения ревью — запросить телефон (с подстановкой из CRM) */
async function askPhone(prisma, peerId, vkSendMessage) {
  const { phones } = await getPastContacts(prisma, peerId);
  if (phones.length) {
    await vkSendMessage(peerId, 'Ваш телефон:', { keyboardJson: buildPhoneKeyboard(phones) });
  } else {
    await vkSendMessage(peerId, VkMsg.MSG_ASK_PHONE, { keyboardJson: null });
  }
}

/** Запросить адрес (с подстановкой из CRM) */
async function askAddr(prisma, peerId, vkSendMessage) {
  const { addrs } = await getPastContacts(prisma, peerId);
  if (addrs.length) {
    await vkSendMessage(peerId, 'Адрес доставки:', { keyboardJson: buildAddrKeyboard(addrs) });
  } else {
    await vkSendMessage(peerId, VkMsg.MSG_ASK_ADDRESS, { keyboardJson: null });
  }
}

/**
 * Старт флоу заказа.
 */
export async function startVkStructuredOrder(prisma, peerId, vkUserId, vkSendMessage, keyboardJson) {
  const branches = await prisma.branch.findMany({ orderBy: { name: 'asc' } });
  if (!branches.length) {
    await vkSendMessage(peerId, VkMsg.MSG_ORDER_NO_BRANCHES, { keyboardJson });
    return;
  }

  if (isTomorrowWeekendEkb()) {
    await vkSendMessage(peerId, 'По выходным не работаем. Заказы на понедельник откроются после публикации меню.', { keyboardJson });
    return;
  }

  const tomorrow = serverLocalTomorrowISO();
  const dateFmt = formatDateWithDow(tomorrow);

  const targetBranchId = (process.env.POLDEN_VK_DEFAULT_BRANCH_ID || '').trim() || branches[0]?.id;
  if (targetBranchId) {
    try {
      const win = await prisma.orderWindow.findUnique({
        where: { branchId_deliveryDate: { branchId: targetBranchId, deliveryDate: tomorrow } }
      });
      if (win && (win.manuallyClosed || new Date() >= win.closesAt)) {
        await vkSendMessage(peerId, 'Приём заказов на завтра закрыт. Загляните позже!', { keyboardJson });
        return;
      }
    } catch { /* таблица ещё не создана — пропускаем */ }
  }

  const forcedBranchId = (process.env.POLDEN_VK_DEFAULT_BRANCH_ID || '').trim();
  const branch = forcedBranchId ? branches.find(b => b.id === forcedBranchId) : null;
  const b = branch || (branches.length === 1 ? branches[0] : null);

  if (branches.length > 1 && !b) {
    const list = branches.map((br, i) => `${i + 1}) ${br.name}`).join('\n');
    await prisma.vkConversationState.update({
      where: { peerId },
      data: { currentState: ORDER_STATES.PICK_BRANCH, draftDeliveryDate: tomorrow, draftBranchId: null, draftCartJson: '[]', draftVkGuideJson: '{}' }
    });
    await vkSendMessage(peerId, `${VkMsg.MSG_ORDER_PICK_BRANCH(list, dateFmt)}\n\n${VkMsg.MSG_ORDER_BRANCH_HINT}`, { keyboardJson: null });
    return;
  }

  const rows = await loadOrderableMenuRows(prisma, b.id, tomorrow);
  if (!rows.length) {
    await vkSendMessage(peerId, VkMsg.MSG_ORDER_MENU_EMPTY, { keyboardJson });
    return;
  }

  // Получаем имя из VK заранее
  const vkName = await fetchVkUserName(vkUserId);

  await prisma.vkConversationState.update({
    where: { peerId },
    data: {
      currentState: ORDER_STATES.GUIDE_SOUP,
      draftBranchId: b.id, draftDeliveryDate: tomorrow, draftCartJson: '[]',
      draftName: vkName || '',
      draftVkGuideJson: JSON.stringify({ rows: rows.map(r => ({ position: r.position, name: r.name, price: r.price })) })
    }
  });

  const soupRows = rowsForCategory(rows, CATEGORY_SOUP);
  if (soupRows.length) {
    await vkSendMessage(peerId, `Суп на ${dateFmt}:`, { keyboardJson: buildPickKeyboard(soupRows, 'Пропустить') });
  } else {
    await goToNextStep(prisma, peerId, vkUserId, vkSendMessage, { draftBranchId: b.id, draftDeliveryDate: tomorrow, draftCartJson: '[]', draftName: vkName || '' }, rows, 'soup');
  }
}

/**
 * Основной обработчик сообщений в рамках флоу заказа.
 */
export async function processVkStructuredOrderFlow(prisma, ctx) {
  const { peerId, vkUserId, text, cmd, state, normCmd, vkSendMessage, keyboardJson, operatorHint } = ctx;

  if (!isStructuredOrderState(state.currentState)) return { handled: false };

  const O = ORDER_STATES;

  // Всегда доступные команды внутри флоу
  if (cmd === 'меню' || text === 'Меню') {
    await clearOrderDraft(prisma, peerId);
    await prisma.vkConversationState.update({ where: { peerId }, data: { currentState: 'IDLE' } });
    return { handled: false, passToIdleHandlers: true };
  }
  if (cmd.includes('помощь') || text === 'Помощь') {
    await clearOrderDraft(prisma, peerId);
    await prisma.vkConversationState.update({ where: { peerId }, data: { currentState: 'IDLE' } });
    await vkSendMessage(peerId, operatorHint, { keyboardJson });
    return { handled: true };
  }

  // Загрузить строки меню из сохранённого guide JSON
  let guideData = {};
  try { guideData = JSON.parse(state.draftVkGuideJson || '{}'); } catch {}
  const rows = guideData.rows || [];

  // Парсим payload из кнопки VK
  let payload = {};
  try {
    const raw = ctx.rawObjectForAudit?.message?.payload;
    if (raw) payload = JSON.parse(raw);
  } catch {}

  const selectedPos = payload.pos ?? null;
  const isSkip = payload.skip === true || cmd === 'пропустить';
  const isDone = payload.done === true || cmd === 'готово';
  const isConfirm = payload.confirm === true || cmd === 'да' || cmd === 'ок' || cmd === 'оформить' || text === 'Оформить ✅';
  const isMore = payload.more === true || text === 'Добавить ещё блюдо';
  const isRestart = payload.restart === true || cmd === 'начать заново';

  const branchId = state.draftBranchId;
  const date = state.draftDeliveryDate;
  const dateFmt = date ? formatDateWithDow(date) : '';

  function getCart() { try { return JSON.parse(state.draftCartJson || '[]'); } catch { return []; } }
  function addToCart(cart, pos) {
    const existing = cart.find(it => it.position === pos);
    if (existing) { existing.qty += 1; } else { cart.push({ position: pos, qty: 1 }); }
    return cart;
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
      const brDate = state.draftDeliveryDate || serverLocalTomorrowISO();
      const brRows = await loadOrderableMenuRows(prisma, b.id, brDate);
      if (!brRows.length) {
        await clearOrderDraft(prisma, peerId);
        await prisma.vkConversationState.update({ where: { peerId }, data: { currentState: 'IDLE' } });
        await vkSendMessage(peerId, VkMsg.MSG_ORDER_MENU_EMPTY, { keyboardJson });
        return { handled: true };
      }
      const brDateFmt = formatDateWithDow(brDate);
      await prisma.vkConversationState.update({
        where: { peerId },
        data: {
          draftBranchId: b.id, draftDeliveryDate: brDate,
          currentState: O.GUIDE_SOUP, draftCartJson: '[]',
          draftVkGuideJson: JSON.stringify({ rows: brRows.map(r => ({ position: r.position, name: r.name, price: r.price })) })
        }
      });
      const soupRows = rowsForCategory(brRows, CATEGORY_SOUP);
      if (soupRows.length) {
        await vkSendMessage(peerId, `Суп на ${brDateFmt}:`, { keyboardJson: buildPickKeyboard(soupRows, 'Пропустить') });
      } else {
        await goToNextStep(prisma, peerId, vkUserId, vkSendMessage, { draftBranchId: b.id, draftDeliveryDate: brDate, draftCartJson: '[]' }, brRows, 'soup');
      }
      return { handled: true };
    }

    case O.GUIDE_SOUP: {
      let cart = getCart();
      if (!isSkip && selectedPos !== null && CATEGORY_SOUP.includes(selectedPos)) {
        cart = addToCart(cart, selectedPos);
        await prisma.vkConversationState.update({ where: { peerId }, data: { draftCartJson: JSON.stringify(cart) } });
      }
      const freshState = { ...state, draftCartJson: JSON.stringify(cart) };
      await goToNextStep(prisma, peerId, vkUserId, vkSendMessage, freshState, rows, 'soup');
      return { handled: true };
    }

    case O.GUIDE_HOT: {
      let cart = getCart();
      if (!isSkip && selectedPos !== null && CATEGORY_HOT.includes(selectedPos)) {
        cart = addToCart(cart, selectedPos);
        await prisma.vkConversationState.update({ where: { peerId }, data: { draftCartJson: JSON.stringify(cart) } });
      }
      const freshState = { ...state, draftCartJson: JSON.stringify(cart) };
      await goToNextStep(prisma, peerId, vkUserId, vkSendMessage, freshState, rows, 'hot');
      return { handled: true };
    }

    case O.GUIDE_SALAD: {
      let cart = getCart();
      if (!isSkip && selectedPos !== null && CATEGORY_SALAD.includes(selectedPos)) {
        cart = addToCart(cart, selectedPos);
        await prisma.vkConversationState.update({ where: { peerId }, data: { draftCartJson: JSON.stringify(cart) } });
      }
      const freshState = { ...state, draftCartJson: JSON.stringify(cart) };
      await goToNextStep(prisma, peerId, vkUserId, vkSendMessage, freshState, rows, 'salad');
      return { handled: true };
    }

    case O.GUIDE_EXTRAS: {
      if (isDone) {
        const cart = getCart();
        await prisma.vkConversationState.update({ where: { peerId }, data: { currentState: O.REVIEW } });
        const summary = await buildCartSummary(prisma, branchId, date, cart);
        if (!cart.length) {
          await vkSendMessage(peerId, 'Корзина пустая — ничего не выбрано. Начнём заново?', { keyboardJson: buildReviewKeyboard() });
        } else {
          await vkSendMessage(peerId, `Ваш заказ на ${dateFmt}:\n\n${summary}`, { keyboardJson: buildReviewKeyboard() });
        }
        return { handled: true };
      }
      if (selectedPos !== null && CATEGORY_EXTRAS.includes(selectedPos)) {
        let cart = getCart();
        cart = addToCart(cart, selectedPos);
        await prisma.vkConversationState.update({ where: { peerId }, data: { draftCartJson: JSON.stringify(cart) } });
        // Показываем обновлённую корзину и снова допы
        const extraRows = rowsForCategory(rows, CATEGORY_EXTRAS);
        const cartRow = rows.find(r => r.position === selectedPos);
        const addedName = cartRow ? String(cartRow.name).trim() : 'поз.' + selectedPos;
        await vkSendMessage(peerId, `Добавлено: ${addedName} ✓\n\nЕщё добавить или нажмите «Готово →»:`, { keyboardJson: buildExtrasKeyboard(extraRows) });
        return { handled: true };
      }
      // Непонятный ввод — повторяем допы
      const extraRows = rowsForCategory(rows, CATEGORY_EXTRAS);
      await vkSendMessage(peerId, 'Нажмите на кнопку блюда или «Готово →»:', { keyboardJson: buildExtrasKeyboard(extraRows) });
      return { handled: true };
    }

    case O.REVIEW: {
      if (isRestart) {
        await clearOrderDraft(prisma, peerId);
        await prisma.vkConversationState.update({ where: { peerId }, data: { currentState: 'IDLE' } });
        await startVkStructuredOrder(prisma, peerId, vkUserId, vkSendMessage, keyboardJson);
        return { handled: true };
      }
      if (isMore) {
        // Начать выбор заново, но корзина сохраняется
        await prisma.vkConversationState.update({ where: { peerId }, data: { currentState: O.GUIDE_SOUP } });
        const soupRows = rowsForCategory(rows, CATEGORY_SOUP);
        if (soupRows.length) {
          await vkSendMessage(peerId, `Добавляем ещё — суп на ${dateFmt}:`, { keyboardJson: buildPickKeyboard(soupRows, 'Пропустить') });
        } else {
          await goToNextStep(prisma, peerId, vkUserId, vkSendMessage, state, rows, 'soup');
        }
        return { handled: true };
      }
      if (isConfirm) {
        // Имя уже сохранено из VK — сразу к телефону
        await prisma.vkConversationState.update({ where: { peerId }, data: { currentState: O.C_PHONE } });
        await askPhone(prisma, peerId, vkSendMessage);
        return { handled: true };
      }
      // Повтор ревью
      const cart = getCart();
      const summary = await buildCartSummary(prisma, branchId, date, cart);
      await vkSendMessage(peerId, `Ваш заказ на ${dateFmt}:\n\n${summary}`, { keyboardJson: buildReviewKeyboard() });
      return { handled: true };
    }

    case O.C_PHONE: {
      // Может прийти кнопкой (payload.phone) или текстом
      const phoneRaw = payload.phone ?? (payload.newPhone ? null : text);
      if (!phoneRaw) {
        // Нажали «Другой номер» — просим ввести
        await vkSendMessage(peerId, 'Введите номер телефона:', { keyboardJson: null });
        return { handled: true };
      }
      const p = normalizePhone(String(phoneRaw));
      if (p.length < 11) {
        await vkSendMessage(peerId, VkMsg.MSG_PHONE_INVALID, { keyboardJson: null });
        return { handled: true };
      }
      await prisma.vkConversationState.update({ where: { peerId }, data: { draftPhone: p, currentState: O.C_ADDR } });
      await askAddr(prisma, peerId, vkSendMessage);
      return { handled: true };
    }

    case O.C_ADDR: {
      // Может прийти кнопкой (payload.addr) или текстом
      const addrRaw = payload.addr ?? (payload.newAddr ? null : text);
      if (!addrRaw) {
        await vkSendMessage(peerId, 'Введите адрес доставки:', { keyboardJson: null });
        return { handled: true };
      }
      if (String(addrRaw).length < 3) {
        await vkSendMessage(peerId, VkMsg.MSG_ADDRESS_TOO_SHORT, { keyboardJson: null });
        return { handled: true };
      }
      await prisma.vkConversationState.update({ where: { peerId }, data: { draftAddress: String(addrRaw).slice(0, 500), currentState: O.C_COMMENT } });
      await vkSendMessage(peerId, VkMsg.MSG_ORDER_ASK_COMMENT, { keyboardJson: buildSkipKeyboard('Пропустить') });
      return { handled: true };
    }

    case O.C_COMMENT: {
      const isSkipComment = payload.skip === true || text.toLowerCase() === 'пропустить' || text === '-';
      const comment = isSkipComment ? '' : text.slice(0, 2000);
      const fresh = await prisma.vkConversationState.findUnique({ where: { peerId } });
      if (!fresh?.draftBranchId || !fresh.draftDeliveryDate) {
        await vkSendMessage(peerId, VkMsg.MSG_ORDER_STATE_BROKEN, { keyboardJson });
        return { handled: true };
      }
      let items;
      try {
        items = JSON.parse(fresh.draftCartJson || '[]');
        if (!Array.isArray(items) || !items.length) throw new Error('empty');
      } catch {
        await vkSendMessage(peerId, VkMsg.MSG_ORDER_STATE_BROKEN, { keyboardJson });
        return { handled: true };
      }

      try {
        const order = await createDeliveryOrderFromInput(prisma, {
          branchId: fresh.draftBranchId,
          deliveryDate: fresh.draftDeliveryDate,
          customerName: fresh.draftName.trim() || 'Клиент',
          customerPhone: fresh.draftPhone,
          items,
          address: fresh.draftAddress.trim(),
          comment: comment || null,
          paymentType: null,
          attributionJson: buildVkOrderAttribution(peerId, vkUserId),
          status: 'NEW',
          sourceChannel: 'VK',
          linkVkLeadId: null
        });

        await prisma.vkConversationState.update({
          where: { peerId },
          data: {
            currentState: 'IDLE', draftName: '', draftPhone: '', draftAddress: '',
            draftRequestedDateText: '', draftComment: '',
            draftBranchId: null, draftDeliveryDate: null, draftCartJson: '[]', draftVkGuideJson: '{}'
          }
        });

        // Порядковый номер — количество всех заказов
        const seqNum = await getOrderSeqNumber(prisma);

        // Читабельный состав заказа
        const guideRows = (guideData.rows || []);
        const nameMap = new Map(guideRows.map(r => [r.position, r.name]));
        const lines = items.map(it => {
          const name = nameMap.get(it.position) || 'поз.' + it.position;
          return `• ${name}${it.qty > 1 ? ' ×' + it.qty : ''}`;
        }).join('\n');

        const q = await computeQuoteKopeks(prisma, fresh.draftBranchId, fresh.draftDeliveryDate, items).catch(() => null);
        const total = q ? rubK(q.totalAmount) : '—';
        const fee = q?.deliveryFeeKopeks > 0 ? rubK(q.deliveryFeeKopeks) + ' ₽' : null;
        const dateFmtOrder = formatDateWithDow(fresh.draftDeliveryDate);

        await vkSendMessage(
          peerId,
          VkMsg.MSG_ORDER_CREATED(seqNum, lines, total, fee, dateFmtOrder),
          { keyboardJson: buildOrderActionsKeyboard() }
        );
      } catch (e) {
        await vkSendMessage(peerId, VkMsg.MSG_ORDER_CREATE_FAIL(String(e.message || e)), { keyboardJson });
      }
      return { handled: true };
    }

    default:
      return { handled: false };
  }
}
