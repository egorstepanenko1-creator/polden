/**
 * Текст меню для VK-бота из ContentItem (не посты сообщества).
 * Правило: channel VK, contentType MENU_DAILY, status APPROVED или PUBLISHED,
 * сортировка: publishDate desc, updatedAt desc; тело — captionDraft (сжимается для чата).
 *
 * Важно: это маркетинговый/анонсный текст из пайплайна. Реальный набор позиций на доставку
 * «завтра» задаётся MenuDayItem и показывается только в потоке «Оформить заказ».
 */

import { buildContentGeneratedUrl } from './contentGeneratedUrl.js';
import {
  MSG_MENU_BODY_PLACEHOLDER,
  MSG_ORDER_LINK_PREFIX,
  MSG_VK_MENU_CONTEXT_LINE,
  MSG_VK_MENU_TRUNC_HINT
} from './messages/vkBotRu.js';

/** Ограничения длины, чтобы не забивать диалог и не дублировать «простыни». */
const MAX_MENU_BODY_LINES = 14;
const MAX_MENU_BODY_CHARS = 960;

/**
 * @param {string} raw
 * @returns {{ text: string, truncated: boolean }}
 */
function truncateMenuBody(raw) {
  const s = String(raw || '').trim();
  if (!s) return { text: '', truncated: false };
  const lines = s.split(/\r?\n/);
  let truncated = lines.length > MAX_MENU_BODY_LINES;
  let chunk = lines.slice(0, MAX_MENU_BODY_LINES).join('\n');
  if (chunk.length > MAX_MENU_BODY_CHARS) {
    chunk = chunk.slice(0, MAX_MENU_BODY_CHARS).trimEnd();
    truncated = true;
  }
  if (truncated && !chunk.endsWith('…')) chunk += '…';
  return { text: chunk, truncated };
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @returns {Promise<import('@prisma/client').ContentItem | null>}
 */
export async function getCurrentVkMenuDailyItem(prisma) {
  const rows = await prisma.contentItem.findMany({
    where: {
      channel: 'VK',
      contentType: 'MENU_DAILY',
      status: { in: ['APPROVED', 'PUBLISHED'] }
    },
    orderBy: [{ publishDate: 'desc' }, { updatedAt: 'desc' }],
    take: 1
  });
  return rows[0] || null;
}

/**
 * @param {import('@prisma/client').ContentItem} item
 */
export function formatVkMenuMessage(item) {
  const bodyRaw = String(item.captionDraft || '').trim();
  const title = String(item.title || '').trim();
  const { text: body, truncated } = truncateMenuBody(bodyRaw);

  const lines = [MSG_VK_MENU_CONTEXT_LINE];
  if (title) lines.push('', title);
  if (body) {
    lines.push('', body);
  } else if (!title) {
    lines.push('', MSG_MENU_BODY_PLACEHOLDER);
  }
  if (truncated) lines.push('', MSG_VK_MENU_TRUNC_HINT);

  const url = buildContentGeneratedUrl({
    channel: item.channel,
    landingPath: item.landingPath,
    targetUrl: item.targetUrl,
    utmSource: item.utmSource,
    utmMedium: item.utmMedium,
    utmCampaign: item.utmCampaign,
    utmContent: item.utmContent
  });
  if (url) {
    lines.push('', `${MSG_ORDER_LINK_PREFIX} ${url}`);
  }

  return lines.join('\n').trim();
}
