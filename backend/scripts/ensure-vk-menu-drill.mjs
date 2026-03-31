/**
 * Создаёт или обновляет тестовый материал меню для живого прогона VK-бота.
 * Env: DATABASE_URL, опционально PUBLIC_SITE_ORIGIN (для валидной generated-ссылки).
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { buildContentGeneratedUrl, resolvePublicSiteOriginMeta } from '../src/contentGeneratedUrl.js';

const prisma = new PrismaClient();

const TITLE = 'Меню · VK live drill';
const CAPTION =
  'Тестовое меню для прогона бота.\n' +
  '• Суп дня — 330 ₽\n' +
  '• Горячее — 330 ₽\n' +
  '• Салат — 330 ₽\n' +
  'Доставка по городу. Нажмите «Оставить заявку», чтобы оператор оформил заказ.';

async function main() {
  const meta = resolvePublicSiteOriginMeta();
  if (!process.env.PUBLIC_SITE_ORIGIN?.trim()) {
    console.warn(
      '[ensure-vk-menu-drill] PUBLIC_SITE_ORIGIN не задан — ссылка в меню будет на заглушку. Для локального прогона добавьте, например: PUBLIC_SITE_ORIGIN=http://localhost:5173'
    );
  } else {
    console.log('[ensure-vk-menu-drill] PUBLIC_SITE_ORIGIN →', meta.effectiveOrigin, `(${meta.code})`);
  }

  const publishDate = new Date();

  const draftRow = {
    channel: 'VK',
    landingPath: '/menu',
    targetUrl: null,
    utmSource: 'vk',
    utmMedium: 'social',
    utmCampaign: 'vk_live_drill',
    utmContent: 'menu_daily_test'
  };
  const generatedUrl = buildContentGeneratedUrl(draftRow);

  const existing = await prisma.contentItem.findFirst({
    where: { channel: 'VK', contentType: 'MENU_DAILY', title: TITLE }
  });

  if (existing) {
    const row = await prisma.contentItem.update({
      where: { id: existing.id },
      data: {
        status: 'APPROVED',
        publishDate,
        captionDraft: CAPTION,
        creativeNote: 'Авто: scripts/ensure-vk-menu-drill.mjs',
        landingPath: draftRow.landingPath,
        targetUrl: null,
        utmSource: draftRow.utmSource,
        utmMedium: draftRow.utmMedium,
        utmCampaign: draftRow.utmCampaign,
        utmContent: draftRow.utmContent,
        generatedUrl
      }
    });
    console.log('[ensure-vk-menu-drill] updated', row.id, row.title);
  } else {
    const row = await prisma.contentItem.create({
      data: {
        title: TITLE,
        channel: 'VK',
        contentType: 'MENU_DAILY',
        status: 'APPROVED',
        publishDate,
        captionDraft: CAPTION,
        creativeNote: 'Авто: scripts/ensure-vk-menu-drill.mjs',
        landingPath: draftRow.landingPath,
        targetUrl: null,
        utmSource: draftRow.utmSource,
        utmMedium: draftRow.utmMedium,
        utmCampaign: draftRow.utmCampaign,
        utmContent: draftRow.utmContent,
        generatedUrl
      }
    });
    console.log('[ensure-vk-menu-drill] created', row.id, row.title);
  }

  console.log('[ensure-vk-menu-drill] generatedUrl:', generatedUrl);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
