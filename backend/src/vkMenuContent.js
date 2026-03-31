/**
 * Текст меню для VK-бота из ContentItem (не посты сообщества).
 * Правило: channel VK, contentType MENU_DAILY, status APPROVED или PUBLISHED,
 * сортировка: publishDate desc, updatedAt desc; текст — captionDraft.
 */

import { buildContentGeneratedUrl } from './contentGeneratedUrl.js';
import { MSG_MENU_BODY_PLACEHOLDER, MSG_ORDER_LINK_PREFIX } from './messages/vkBotRu.js';

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
  const body = String(item.captionDraft || '').trim();
  const title = String(item.title || '').trim();
  const lines = [];
  if (title) lines.push(`Меню: ${title}`);
  if (body) lines.push(body);
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
    lines.push('');
    lines.push(`${MSG_ORDER_LINK_PREFIX} ${url}`);
  }
  return lines.join('\n').trim() || MSG_MENU_BODY_PLACEHOLDER;
}
