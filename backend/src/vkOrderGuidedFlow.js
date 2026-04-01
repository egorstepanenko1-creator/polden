/**
 * Пошаговый выбор позиций VK: суп / горячее / салат (1–2 варианта + пропуск),
 * затем допы (текст + пропуск). Текстовый парсер корзины — fallback на любом шаге.
 */

import { computeQuoteKopeks } from './pricing.js';
import { parseVkCartLine } from './vkCartParse.js';
import { loadOrderableMenuRows } from './vkOrderMenu.js';
import { ORDER_STATES } from './vkOrderFlowConstants.js';
import * as VkMsg from './messages/vkBotRu.js';

const O = ORDER_STATES;

/** @typedef {{ key: string, title: string, pick: string, more: string, next: string, positions: number[] }} GuideCat */

/** @type {GuideCat[]} */
const CATEGORIES = [
  { key: 'soup', title: 'Суп', pick: O.G_SOUP, more: O.G_SOUP_MORE, next: O.G_HOT, positions: [1, 2] },
  { key: 'hot', title: 'Горячее', pick: O.G_HOT, more: O.G_HOT_MORE, next: O.G_SALAD, positions: [3, 4] },
  { key: 'salad', title: 'Салат', pick: O.G_SALAD, more: O.G_SALAD_MORE, next: O.G_EXTRAS, positions: [5, 6] }
];

function rubK(kopeks) {
  return (Number(kopeks) / 100).toLocaleString('ru-RU', { maximumFractionDigits: 0 });
}

/** @param {Array<{ position: number, name: string, price: number }>} rows */
function rowByPosition(rows) {
  return new Map(rows.map((r) => [r.position, r]));
}

function readCartJson(raw) {
  try {
    const a = JSON.parse(raw || '[]');
    return Array.isArray(a) ? a : [];
  } catch {
    return [];
  }
}

/** @param {Array<{ position: number, qty: number }>} existing @param {Array<{ position: number, qty: number }>} delta */
function mergeCartItems(existing, delta) {
  const m = new Map();
  for (const it of existing) {
    const p = Number(it.position);
    const q = Number(it.qty);
    if (Number.isInteger(p) && p >= 1 && p <= 10 && Number.isInteger(q) && q > 0) {
      m.set(p, (m.get(p) || 0) + q);
    }
  }
  for (const it of delta) {
    const p = Number(it.position);
    const q = Number(it.qty);
    if (Number.isInteger(p) && p >= 1 && p <= 10 && Number.isInteger(q) && q > 0) {
      m.set(p, (m.get(p) || 0) + q);
    }
  }
  return [...m.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([position, qty]) => ({ position, qty }));
}

function isSkipCmd(cmd, text) {
  const t = String(text || '').trim();
  return (
    cmd.includes('пропустить') ||
    cmd === 'пропуск' ||
    cmd === 'skip' ||
    t === '0' ||
    cmd === '0'
  );
}

function isMoreCmd(cmd) {
  return (
    cmd === 'ещё' ||
    cmd === 'еще' ||
    cmd.includes('добавить ещё') ||
    cmd.includes('добавить еще') ||
    cmd.includes('ещё из') ||
    cmd.includes('еще из') ||
    cmd.includes('добавить еще')
  );
}

function isNextCmd(cmd, text) {
  const t = String(text || '').trim().toLowerCase();
  return cmd === 'дальше' || cmd === 'далее' || t === 'дальше' || t === 'далее';
}

/**
 * @param {Array<{ position: number, name: string, price: number }>} rows
 * @param {number[]} positions
 */
function slotsForCategory(rows, positions) {
  const map = rowByPosition(rows);
  const out = [];
  for (const p of positions) {
    const r = map.get(p);
    if (r && String(r.name || '').trim()) out.push(r);
  }
  return out;
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} peerId
 * @param {Array<{ position: number, qty: number }>} cart
 */
async function saveCart(prisma, peerId, cart, state) {
  await prisma.vkConversationState.update({
    where: { peerId },
    data: { draftCartJson: JSON.stringify(cart), currentState: state }
  });
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} peerId
 * @param {string} branchId
 * @param {string} date
 * @param {Array<{ position: number, qty: number }>} items
 * @param {(peerId: string, text: string, opts?: { keyboardJson?: string | null }) => Promise<unknown>} vkSendMessage
 */
/**
 * Текст проверки заказа с доставкой (для VK).
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} branchId
 * @param {string} date
 * @param {Array<{ position: number, qty: number }>} items
 * @returns {Promise<{ ok: true, text: string, quote: object } | { ok: false, error: string }>}
 */
export async function formatVkOrderReviewMessage(prisma, branchId, date, items) {
  if (!items.length) return { ok: false, error: 'empty' };
  let q;
  try {
    q = await computeQuoteKopeks(prisma, branchId, date, items);
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
  const rows = await loadOrderableMenuRows(prisma, branchId, date);
  const rb = rowByPosition(rows);
  const lines = items
    .map((it) => {
      const r = rb.get(it.position);
      const name = r?.name ? String(r.name).trim() : `поз. ${it.position}`;
      return `• ${name} × ${it.qty}`;
    })
    .join('\n');
  const feeLabel = q.deliveryFeeKopeks > 0 ? `${rubK(q.deliveryFeeKopeks)} ₽` : 'бесплатно';
  const text = VkMsg.MSG_ORDER_REVIEW_WITH_DELIVERY(lines, {
    sub: rubK(q.itemsSubtotalKopeks),
    fee: feeLabel,
    total: rubK(q.totalAmount)
  });
  return { ok: true, text, quote: q };
}

async function goToReview(prisma, peerId, branchId, date, items, vkSendMessage) {
  const formatted = await formatVkOrderReviewMessage(prisma, branchId, date, items);
  if (!formatted.ok) {
    if (formatted.error === 'empty') {
      await vkSendMessage(peerId, VkMsg.MSG_ORDER_GUIDE_EMPTY_CART, { keyboardJson: null });
    } else {
      await vkSendMessage(
        peerId,
        `${VkMsg.MSG_ORDER_QUOTE_FAIL(formatted.error)}\n\n${VkMsg.MSG_ORDER_GUIDE_FALLBACK_HINT}`,
        { keyboardJson: null }
      );
    }
    return;
  }
  await prisma.vkConversationState.update({
    where: { peerId },
    data: { draftCartJson: JSON.stringify(items), currentState: O.REVIEW }
  });
  await vkSendMessage(peerId, formatted.text, { keyboardJson: null });
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} peerId
 * @param {GuideCat} cat
 * @param {Array<{ position: number, name: string, price: number }>} slots
 */
async function sendCategoryPick(prisma, peerId, cat, slots) {
  await prisma.vkConversationState.update({
    where: { peerId },
    data: { currentState: cat.pick }
  });
  return VkMsg.MSG_ORDER_GUIDE_CATEGORY_PICK(cat.title, slots);
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string | null} afterCatKey ключ завершённой категории ('soup'|'hot'|'salad') или null — с первой
 */
async function enterNextCategoryWithMenu(
  prisma,
  peerId,
  branchId,
  date,
  vkSendMessage,
  afterCatKey = null
) {
  const rows = await loadOrderableMenuRows(prisma, branchId, date);
  const startIdx = afterCatKey ? CATEGORIES.findIndex((c) => c.key === afterCatKey) : -1;
  const from = startIdx >= 0 ? startIdx + 1 : 0;
  for (let i = from; i < CATEGORIES.length; i++) {
    const cat = CATEGORIES[i];
    const slots = slotsForCategory(rows, cat.positions);
    if (!slots.length) continue;
    const msg = await sendCategoryPick(prisma, peerId, cat, slots);
    await vkSendMessage(peerId, msg, { keyboardJson: null });
    return true;
  }
  return enterExtras(prisma, peerId, branchId, date, rows, vkSendMessage);
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 */
async function enterExtras(prisma, peerId, branchId, date, rows, vkSendMessage) {
  const extras = slotsForCategory(
    rows,
    [7, 8, 9, 10]
  );
  await prisma.vkConversationState.update({
    where: { peerId },
    data: { currentState: O.G_EXTRAS }
  });
  if (!extras.length) {
    const cart = readCartJson(
      (await prisma.vkConversationState.findUnique({ where: { peerId } }))?.draftCartJson
    );
    await goToReview(prisma, peerId, branchId, date, cart, vkSendMessage);
    return true;
  }
  await vkSendMessage(peerId, VkMsg.MSG_ORDER_GUIDE_EXTRAS(extras), { keyboardJson: null });
  return true;
}

/**
 * Старт пошагового заказа после выбора точки и даты.
 * @param {import('@prisma/client').PrismaClient} prisma
 */
/**
 * @param {string} [branchName] подпись точки для первого сообщения
 */
export async function startVkOrderGuide(prisma, peerId, branchId, date, vkSendMessage, branchName = '') {
  const rows = await loadOrderableMenuRows(prisma, branchId, date);
  if (!rows.length) return false;
  await prisma.vkConversationState.update({
    where: { peerId },
    data: {
      draftCartJson: '[]',
      draftVkGuideJson: '{}',
      draftBranchId: branchId,
      draftDeliveryDate: date
    }
  });
  const head = branchName
    ? `${VkMsg.MSG_ORDER_BRANCH_PICKED(branchName, date)}\n\n`
    : '';
  await vkSendMessage(peerId, `${head}${VkMsg.MSG_ORDER_GUIDE_INTRO(date)}`, { keyboardJson: null });
  const ok = await enterNextCategoryWithMenu(prisma, peerId, branchId, date, vkSendMessage, null);
  return ok;
}

/**
 * После «пропустить раздел» или «дальше» — следующая категория.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {GuideCat} finishedCat
 */
async function advanceAfterCategoryDone(prisma, peerId, branchId, date, vkSendMessage, finishedCat) {
  return enterNextCategoryWithMenu(prisma, peerId, branchId, date, vkSendMessage, finishedCat.key);
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {{
 *   peerId: string,
 *   text: string,
 *   cmd: string,
 *   state: import('@prisma/client').VkConversationState,
 *   vkSendMessage: (peerId: string, text: string, opts?: { keyboardJson?: string | null }) => Promise<unknown>,
 * }} ctx
 */
export async function processVkGuideFlow(prisma, ctx) {
  const { peerId, text, cmd, state, vkSendMessage } = ctx;
  const branchId = state.draftBranchId;
  const date = state.draftDeliveryDate;
  if (!branchId || !date) {
    await vkSendMessage(peerId, VkMsg.MSG_ORDER_STATE_BROKEN, { keyboardJson: null });
    return { handled: true };
  }

  const st = state.currentState;
  const cart = readCartJson(state.draftCartJson);
  const rows = await loadOrderableMenuRows(prisma, branchId, date);

  /** Fallback: одной строкой заменить корзину и перейти к проверке (не в шаге «допы» — там только добавление к текущей). */
  const tryTextCart = async () => {
    const parsed = parseVkCartLine(text);
    if (!parsed.ok) return false;
    try {
      await computeQuoteKopeks(prisma, branchId, date, parsed.items);
    } catch {
      return false;
    }
    await goToReview(prisma, peerId, branchId, date, parsed.items, vkSendMessage);
    return true;
  };

  if (st !== O.G_EXTRAS && (await tryTextCart())) return { handled: true };

  const findCatByPick = (pick) => CATEGORIES.find((c) => c.pick === pick);
  const findCatByMore = (more) => CATEGORIES.find((c) => c.more === more);

  if (st === O.G_EXTRAS) {
    if (isSkipCmd(cmd, text)) {
      await goToReview(prisma, peerId, branchId, date, cart, vkSendMessage);
      return { handled: true };
    }
    const parsed = parseVkCartLine(text);
    if (parsed.ok) {
      const merged = mergeCartItems(cart, parsed.items);
      try {
        await computeQuoteKopeks(prisma, branchId, date, merged);
      } catch (e) {
        await vkSendMessage(
          peerId,
          `${VkMsg.MSG_ORDER_QUOTE_FAIL(String(e.message || e))}\n\n${VkMsg.MSG_ORDER_GUIDE_EXTRAS_RETRY}`,
          { keyboardJson: null }
        );
        return { handled: true };
      }
      await saveCart(prisma, peerId, merged, O.G_EXTRAS);
      await goToReview(prisma, peerId, branchId, date, merged, vkSendMessage);
      return { handled: true };
    }
    await vkSendMessage(peerId, VkMsg.MSG_ORDER_GUIDE_EXTRAS_INVALID, { keyboardJson: null });
    return { handled: true };
  }

  if (st === O.G_SOUP_MORE || st === O.G_HOT_MORE || st === O.G_SALAD_MORE) {
    const cat = findCatByMore(st);
    if (!cat) return { handled: false };
    if (isMoreCmd(cmd) || textIsMoreButton(cmd)) {
      const slots = slotsForCategory(rows, cat.positions);
      if (!slots.length) {
        await advanceAfterCategoryDone(prisma, peerId, branchId, date, vkSendMessage, cat);
        return { handled: true };
      }
      const msg = await sendCategoryPick(prisma, peerId, cat, slots);
      await vkSendMessage(peerId, msg, { keyboardJson: null });
      return { handled: true };
    }
    if (isNextCmd(cmd, text)) {
      await advanceAfterCategoryDone(prisma, peerId, branchId, date, vkSendMessage, cat);
      return { handled: true };
    }
    await vkSendMessage(peerId, VkMsg.MSG_ORDER_GUIDE_MORE_UNCLEAR(cat.title), { keyboardJson: null });
    return { handled: true };
  }

  const catPick = findCatByPick(st);
  if (catPick) {
    const slots = slotsForCategory(rows, catPick.positions);
    if (!slots.length) {
      await advanceAfterCategoryDone(prisma, peerId, branchId, date, vkSendMessage, catPick);
      return { handled: true };
    }
    if (isSkipCmd(cmd, text)) {
      await advanceAfterCategoryDone(prisma, peerId, branchId, date, vkSendMessage, catPick);
      return { handled: true };
    }
    const n = parseInt(String(text).trim(), 10);
    let picked = null;
    if (n === 1 && slots[0]) picked = slots[0];
    else if (n === 2 && slots[1]) picked = slots[1];
    if (!picked) {
      await vkSendMessage(peerId, VkMsg.MSG_ORDER_GUIDE_PICK_INVALID(slots.length), { keyboardJson: null });
      return { handled: true };
    }
    const nextCart = mergeCartItems(cart, [{ position: picked.position, qty: 1 }]);
    await saveCart(prisma, peerId, nextCart, catPick.more);
    await vkSendMessage(peerId, VkMsg.MSG_ORDER_GUIDE_AFTER_PICK(catPick.title), { keyboardJson: null });
    return { handled: true };
  }

  return { handled: false };
}
