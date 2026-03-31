import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import { sanitizeAttribution, parseAttributionJson } from './attribution.js';
import { computeQuoteKopeks } from './pricing.js';
import { buildLaunchKpiPayload } from './launchKpis.js';
import { foodCostBreakdownKopeks } from './foodCost.js';
import { resolveMenuDayEconomicsFields } from './menuDayItemEconomics.js';
import { createKitchenCatalogRouter } from './kitchenCatalogRoutes.js';
import { buildDayEconomicsPayload } from './dayEconomics.js';
import { buildDayProductionRequirementsPayload } from './dayProductionRequirements.js';
import { buildProductionStockGapPayload } from './productionStockGap.js';
import { buildPurchaseNeedSnapshotPayload } from './purchaseNeedSnapshot.js';
import {
  mergeWriteoffProgressIntoDayProductionPayload,
  runProductionWriteoff
} from './productionWriteoff.js';
import {
  getProductionWriteoffBatchDetail,
  listProductionWriteoffBatches,
  serializeProductionWriteoffBatchDetail,
  serializeProductionWriteoffBatchListItem
} from './productionWriteoffHistory.js';
import { createStockRouter } from './stockRoutes.js';
import { createSupplierRouter } from './supplierRoutes.js';
import { createPurchaseDraftRouter } from './purchaseDraftRoutes.js';
import { getProcurementBoardPayload } from './procurementBoard.js';
import { createContentItemRouter } from './contentItemRoutes.js';
import {
  buildContentGeneratedUrl,
  getContentItemGeneratedUrlSafety,
  resolvePublicSiteOriginMeta
} from './contentGeneratedUrl.js';
import { buildContentPerformanceList } from './contentPerformance.js';
import { createLaunchDrillRouter } from './launchDrillRoutes.js';
import { createVkWebhookRouter } from './vkWebhookRoutes.js';
import { createVkLeadRouter } from './vkLeadRoutes.js';
import { getCurrentVkMenuDailyItem, formatVkMenuMessage } from './vkMenuContent.js';
import * as ReadinessRu from './messages/readinessRu.js';

const prisma = new PrismaClient();
const app = express();
const PORT = Number(process.env.PORT || 4000);
const CRM_TOKEN = process.env.CRM_INTERNAL_TOKEN || 'dev';

app.use(cors());
app.use(express.json({ limit: '256kb' }));

function ok(data) {
  return { ok: true, data };
}
function fail(message, code = 'BAD_REQUEST') {
  return { ok: false, error: { message, code } };
}

function normalizePhone(raw) {
  let d = String(raw || '').replace(/\D/g, '').replace(/^8/, '7');
  if (!d.startsWith('7')) d = '7' + d;
  return d.slice(0, 11);
}

function mapItems(rows) {
  return [...rows]
    .sort((a, b) => a.position - b.position)
    .map((it) => ({ position: it.position, qty: it.qty }));
}

/** Публичный ответ создания заказа — без атрибуции. */
function toPublicOrder(order) {
  return {
    id: order.id,
    deliveryDate: order.deliveryDate,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    totalAmount: order.totalAmount,
    items: mapItems(order.items),
    branch: { name: order.branch.name }
  };
}

/** Заказ для CRM (защищённые чтения). */
function toProtectedOrder(order) {
  const base = toPublicOrder(order);
  return {
    ...base,
    address: order.address,
    comment: order.comment,
    paymentType: order.paymentType,
    createdAt: order.createdAt.toISOString(),
    attribution: parseAttributionJson(order.attributionJson)
  };
}

app.get('/health', (req, res) => {
  res.json(ok({ status: 'healthy' }));
});

/** VK Callback API (секрет VK_WEBHOOK_SECRET), без CRM-токена. */
app.use('/api/vk/webhook', createVkWebhookRouter(prisma));

app.get('/api/public/branches', async (req, res) => {
  try {
    const branches = await prisma.branch.findMany({ orderBy: { name: 'asc' } });
    res.json(ok(branches));
  } catch (e) {
    res.status(500).json(fail(e.message || 'Server error', 'INTERNAL'));
  }
});

app.get('/api/public/menu-day', async (req, res) => {
  const branchId = req.query.branchId;
  const date = req.query.date;
  if (!branchId || !date) {
    return res.status(400).json(fail('Укажите branchId и date'));
  }
  try {
    const rows = await prisma.menuDayItem.findMany({
      where: { branchId: String(branchId), date: String(date) },
      orderBy: { position: 'asc' }
    });
    const items = rows.map((i) => ({
      position: i.position,
      name: i.name,
      price: i.price
    }));
    res.json(ok({ items, branchId: String(branchId) }));
  } catch (e) {
    res.status(500).json(fail(e.message || 'Server error', 'INTERNAL'));
  }
});

app.post('/api/public/delivery-orders/quote', async (req, res) => {
  const { branchId, deliveryDate, items } = req.body || {};
  try {
    const q = await computeQuoteKopeks(prisma, branchId, deliveryDate, items);
    res.json(ok(q));
  } catch (e) {
    res.status(400).json(fail(e.message || 'Quote failed', 'QUOTE_ERROR'));
  }
});

app.post('/api/public/delivery-orders', async (req, res) => {
  const body = req.body || {};
  const {
    branchId,
    deliveryDate,
    customerName,
    customerPhone,
    items
  } = body;

  if (!branchId || !deliveryDate) {
    return res.status(400).json(fail('branchId и deliveryDate обязательны'));
  }
  if (!customerName || !String(customerName).trim()) {
    return res.status(400).json(fail('customerName обязателен'));
  }
  const phone = normalizePhone(customerPhone);
  if (phone.length < 11) {
    return res.status(400).json(fail('Некорректный телефон'));
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json(fail('items не может быть пустым'));
  }

  const attribution = sanitizeAttribution(body.attribution);
  const attributionJson = attribution ? JSON.stringify(attribution) : null;

  let quote;
  try {
    quote = await computeQuoteKopeks(prisma, branchId, deliveryDate, items);
  } catch (e) {
    return res.status(400).json(fail(e.message || 'Некорректный состав заказа', 'ORDER_ITEMS'));
  }

  const totalAmount = quote.totalAmount;

  try {
    const order = await prisma.deliveryOrder.create({
      data: {
        branchId: String(branchId),
        deliveryDate: String(deliveryDate),
        customerName: String(customerName).trim().slice(0, 200),
        customerPhone: phone,
        address: body.address != null ? String(body.address).trim().slice(0, 500) || null : null,
        comment: body.comment != null ? String(body.comment).trim().slice(0, 2000) || null : null,
        paymentType: body.paymentType != null ? String(body.paymentType).trim().slice(0, 32) || null : null,
        totalAmount,
        attributionJson,
        items: {
          create: items.map((line) => ({
            position: Number(line.position),
            qty: Number(line.qty)
          }))
        }
      },
      include: { branch: true, items: true }
    });

    res.json(ok(toPublicOrder(order)));
  } catch (e) {
    res.status(500).json(fail(e.message || 'Не удалось создать заказ', 'CREATE_ERROR'));
  }
});

function requireCrmToken(req, res, next) {
  const t = req.headers['x-crm-token'];
  if (t !== CRM_TOKEN) {
    return res.status(401).json(fail('Нужен заголовок X-CRM-Token', 'UNAUTHORIZED'));
  }
  next();
}

/** Живой прогон VK: env + текущее меню бота (X-CRM-Token; секреты не возвращаются). */
app.get('/api/vk-bot/readiness', requireCrmToken, async (req, res) => {
  try {
    const secret = (process.env.VK_WEBHOOK_SECRET || '').trim();
    const token = (process.env.VK_GROUP_ACCESS_TOKEN || '').trim();
    const conf = (process.env.VK_CALLBACK_CONFIRMATION_CODE || '').trim();
    const crmInternalTokenFromEnv = Boolean(
      process.env.CRM_INTERNAL_TOKEN != null && String(process.env.CRM_INTERNAL_TOKEN).trim() !== ''
    );

    const menuItem = await getCurrentVkMenuDailyItem(prisma);
    const originMeta = resolvePublicSiteOriginMeta();
    /** @type {Record<string, unknown>} */
    let menuDaily = {
      present: false,
      hasUsableCaption: false,
      id: null,
      title: null,
      generatedUrlComputed: null,
      generatedUrlPublishSafe: false,
      generatedUrlSafetyCode: null,
      botMessagePreview: null
    };
    if (menuItem) {
      const urlSafety = getContentItemGeneratedUrlSafety(menuItem);
      const generatedUrlComputed = buildContentGeneratedUrl({
        channel: menuItem.channel,
        landingPath: menuItem.landingPath,
        targetUrl: menuItem.targetUrl,
        utmSource: menuItem.utmSource,
        utmMedium: menuItem.utmMedium,
        utmCampaign: menuItem.utmCampaign,
        utmContent: menuItem.utmContent
      });
      const previewFull = formatVkMenuMessage(menuItem);
      const cap = String(menuItem.captionDraft || '').trim();
      menuDaily = {
        present: true,
        hasUsableCaption: cap.length >= 20,
        id: menuItem.id,
        title: menuItem.title,
        generatedUrlComputed,
        generatedUrlPublishSafe: urlSafety.isSafeForPublish,
        generatedUrlSafetyCode: urlSafety.code,
        botMessagePreview: previewFull.length > 280 ? `${previewFull.slice(0, 280)}…` : previewFull
      };
    }

    const vkCoreEnvOk = token.length > 0 && conf.length > 0;
    const menuOk = Boolean(menuDaily.present && menuDaily.hasUsableCaption);
    const vkLiveDrillReady = Boolean(vkCoreEnvOk && menuOk && menuDaily.generatedUrlPublishSafe);

    res.json(
      ok({
        vkWebhookSecretConfigured: secret.length > 0,
        vkGroupAccessTokenConfigured: token.length > 0,
        vkCallbackConfirmationConfigured: conf.length > 0,
        crmInternalTokenFromEnv,
        crmTokenConsistentHint: ReadinessRu.CRM_TOKEN_HINT,
        webhookPostUrl: '/api/vk/webhook',
        publicSiteOrigin: {
          code: originMeta.code,
          effectiveOrigin: originMeta.effectiveOrigin,
          isSafeForPublish: originMeta.isSafeForPublish
        },
        menuContentRule: ReadinessRu.MENU_CONTENT_RULE_RU,
        menuDaily,
        vkLiveDrillReady,
        vkLiveDrillBlockers: [
          !token.length ? ReadinessRu.BLOCKER_NO_GROUP_TOKEN : null,
          !conf.length ? ReadinessRu.BLOCKER_NO_CONFIRMATION : null,
          !menuDaily.present ? ReadinessRu.BLOCKER_NO_MENU : null,
          menuDaily.present && !menuDaily.hasUsableCaption ? ReadinessRu.BLOCKER_MENU_CAPTION_SHORT : null,
          menuDaily.present && !menuDaily.generatedUrlPublishSafe ? ReadinessRu.BLOCKER_MENU_URL_UNSAFE : null
        ].filter(Boolean)
      })
    );
  } catch (e) {
    res.status(500).json(fail(e.message || 'Ошибка проверки готовности VK', 'INTERNAL'));
  }
});

/** Kitchen catalog CRUD (economics v1) — same CRM token as orders/menu-day. */
app.get('/api/content-pipeline/origin-status', requireCrmToken, (req, res) => {
  const m = resolvePublicSiteOriginMeta();
  res.json(
    ok({
      code: m.code,
      effectiveOrigin: m.effectiveOrigin,
      isSafeForPublish: m.isSafeForPublish
    })
  );
});

app.use('/api/content-items', requireCrmToken, createContentItemRouter(prisma));

app.get('/api/content-performance', requireCrmToken, async (req, res) => {
  try {
    const data = await buildContentPerformanceList(prisma, req.query);
    res.json(ok(data));
  } catch (e) {
    res.status(500).json(fail(e.message || 'content performance failed', 'INTERNAL'));
  }
});

app.use('/api/launch-drills', requireCrmToken, createLaunchDrillRouter(prisma));

app.use('/api/vk-leads', requireCrmToken, createVkLeadRouter(prisma));

app.use('/api/kitchen', requireCrmToken, createKitchenCatalogRouter(prisma));

/** Stock journal v1 — movements only; balances derived. */
app.use('/api/stock', requireCrmToken, createStockRouter(prisma));

/** Suppliers v1 — справочник и офферы; без заказов. */
app.use('/api/suppliers', requireCrmToken, createSupplierRouter(prisma));

/** Черновики закупки v1 — из снимка потребности. */
app.use('/api/purchase-drafts', requireCrmToken, createPurchaseDraftRouter(prisma));

/** Доска закупок v1 — обзор черновиков и приёмки (фильтры опциональны). */
app.get('/api/procurement-board', requireCrmToken, async (req, res) => {
  try {
    const data = await getProcurementBoardPayload(prisma, {
      branchId: req.query.branchId,
      date: req.query.date,
      receiptStatus: req.query.receiptStatus,
      limit: req.query.limit
    });
    res.json(ok(data));
  } catch (e) {
    res.status(500).json(fail(e.message || 'procurement board failed', 'INTERNAL'));
  }
});

/** Protected CRM view of menu-day rows including economics linkage (not public). */
function toProtectedMenuDayItem(row) {
  return {
    id: row.id,
    branchId: row.branchId,
    date: row.date,
    position: row.position,
    name: row.name,
    price: row.price,
    dishVersionId: row.dishVersionId,
    foodCostKopeksSnapshot: row.foodCostKopeksSnapshot,
    foodCostSnapshottedAt: row.foodCostSnapshottedAt ? row.foodCostSnapshottedAt.toISOString() : null
  };
}

app.get('/api/delivery-orders', requireCrmToken, async (req, res) => {
  const branchId = req.query.branchId;
  const date = req.query.date;
  if (!branchId || !date) {
    return res.status(400).json(fail('Укажите branchId и date'));
  }
  try {
    const orders = await prisma.deliveryOrder.findMany({
      where: { branchId: String(branchId), deliveryDate: String(date) },
      orderBy: { createdAt: 'desc' },
      include: { branch: true, items: true }
    });
    res.json(ok(orders.map(toProtectedOrder)));
  } catch (e) {
    res.status(500).json(fail(e.message || 'Server error', 'INTERNAL'));
  }
});

/**
 * KPI запуска: заказы по дате создания (окно календарных дней), агрегаты и топ источников.
 * Query: branchId (обяз.), days=1..90 (по умолч. 7) — сколько календарных дней включая сегодня (по времени сервера).
 */
app.get('/api/dashboard/launch-kpis', requireCrmToken, async (req, res) => {
  const branchId = req.query.branchId;
  if (!branchId) {
    return res.status(400).json(fail('Укажите branchId'));
  }
  let days = Number(req.query.days ?? 7);
  if (!Number.isFinite(days) || days < 1) days = 7;
  if (days > 90) days = 90;

  const since = new Date();
  since.setHours(0, 0, 0, 0);
  since.setDate(since.getDate() - (days - 1));

  try {
    const orders = await prisma.deliveryOrder.findMany({
      where: {
        branchId: String(branchId),
        createdAt: { gte: since }
      },
      select: {
        id: true,
        deliveryDate: true,
        totalAmount: true,
        createdAt: true,
        attributionJson: true,
        customerName: true
      },
      orderBy: { createdAt: 'desc' }
    });

    const data = buildLaunchKpiPayload(orders, { days, since });
    res.json(ok(data));
  } catch (e) {
    res.status(500).json(fail(e.message || 'Server error', 'INTERNAL'));
  }
});

/**
 * Debug-only: food cost for a DishVersion at a point in time (CRM token). Not public.
 * GET /api/debug/food-cost?versionId=&at=ISO8601
 */
/**
 * CRM: list menu-day items for a branch+date (includes dishVersionId + food cost snapshot fields).
 * GET /api/menu-day-items?branchId=&date=
 */
app.get('/api/menu-day-items', requireCrmToken, async (req, res) => {
  const branchId = req.query.branchId;
  const date = req.query.date;
  if (!branchId || !date) {
    return res.status(400).json(fail('branchId and date required'));
  }
  try {
    const rows = await prisma.menuDayItem.findMany({
      where: { branchId: String(branchId), date: String(date) },
      orderBy: { position: 'asc' }
    });
    res.json(ok(rows.map(toProtectedMenuDayItem)));
  } catch (e) {
    res.status(500).json(fail(e.message || 'Server error', 'INTERNAL'));
  }
});

/**
 * CRM: меню дня + заказы на дату доставки → продажи и оценка маржи по снимкам себестоимости.
 * GET /api/day-economics?branchId=&date=  (date = deliveryDate = дата меню)
 */
app.get('/api/day-economics', requireCrmToken, async (req, res) => {
  const branchId = req.query.branchId;
  const date = req.query.date;
  if (!branchId || !date) {
    return res.status(400).json(fail('branchId and date required'));
  }
  try {
    const [menuRows, orders] = await Promise.all([
      prisma.menuDayItem.findMany({
        where: { branchId: String(branchId), date: String(date) },
        orderBy: { position: 'asc' },
        select: {
          id: true,
          position: true,
          name: true,
          price: true,
          foodCostKopeksSnapshot: true
        }
      }),
      prisma.deliveryOrder.findMany({
        where: { branchId: String(branchId), deliveryDate: String(date) },
        select: {
          items: { select: { position: true, qty: true } }
        }
      })
    ]);
    const payload = buildDayEconomicsPayload(String(branchId), String(date), menuRows, orders);
    res.json(ok(payload));
  } catch (e) {
    res.status(500).json(fail(e.message || 'Server error', 'INTERNAL'));
  }
});

/**
 * CRM: потребность в ингредиентах на дату по фактическим заказам и рецептам из меню (dishVersionId).
 * GET /api/day-production-requirements?branchId=&date=
 */
app.get('/api/day-production-requirements', requireCrmToken, async (req, res) => {
  const branchId = req.query.branchId;
  const date = req.query.date;
  if (!branchId || !date) {
    return res.status(400).json(fail('branchId and date required'));
  }
  try {
    const payload = await buildDayProductionRequirementsPayload(prisma, String(branchId), String(date));
    await mergeWriteoffProgressIntoDayProductionPayload(prisma, payload);
    res.json(ok(payload));
  } catch (e) {
    res.status(500).json(fail(e.message || 'Server error', 'INTERNAL'));
  }
});

/**
 * GET /api/production-writeoff-batches?branchId=&date=
 */
app.get('/api/production-writeoff-batches', requireCrmToken, async (req, res) => {
  const branchId = req.query.branchId;
  const date = req.query.date;
  if (!branchId || !date) {
    return res.status(400).json(fail('branchId and date required'));
  }
  try {
    const rows = await listProductionWriteoffBatches(prisma, String(branchId), String(date));
    res.json(ok(rows.map(serializeProductionWriteoffBatchListItem)));
  } catch (e) {
    res.status(500).json(fail(e.message || 'list production writeoff batches failed', 'INTERNAL'));
  }
});

/**
 * GET /api/production-writeoff-batches/:batchId
 */
app.get('/api/production-writeoff-batches/:batchId', requireCrmToken, async (req, res) => {
  const batchId = req.params.batchId != null ? String(req.params.batchId).trim() : '';
  if (!batchId) {
    return res.status(400).json(fail('batchId required'));
  }
  try {
    const batch = await getProductionWriteoffBatchDetail(prisma, batchId);
    if (!batch) {
      return res.status(404).json(fail('Batch not found', 'NOT_FOUND'));
    }
    res.json(ok(serializeProductionWriteoffBatchDetail(batch)));
  } catch (e) {
    res.status(500).json(fail(e.message || 'get production writeoff batch failed', 'INTERNAL'));
  }
});

/**
 * CRM: потребность дня vs остатки по журналу (ingredientId + unitId).
 * GET /api/production-stock-gap?branchId=&date=
 */
app.get('/api/production-stock-gap', requireCrmToken, async (req, res) => {
  const branchId = req.query.branchId;
  const date = req.query.date;
  if (!branchId || !date) {
    return res.status(400).json(fail('branchId and date required'));
  }
  try {
    const payload = await buildProductionStockGapPayload(prisma, String(branchId), String(date));
    res.json(ok(payload));
  } catch (e) {
    res.status(500).json(fail(e.message || 'Server error', 'INTERNAL'));
  }
});

/**
 * CRM: снимок потребности в закупках (только строки с purchaseNeedQty > 0).
 * GET /api/purchase-need-snapshot?branchId=&date=&at= (at — ISO момент оценки офферов, по умолчанию сейчас)
 */
app.get('/api/purchase-need-snapshot', requireCrmToken, async (req, res) => {
  const branchId = req.query.branchId;
  const date = req.query.date;
  if (!branchId || !date) {
    return res.status(400).json(fail('branchId and date required'));
  }
  let at = new Date();
  if (req.query.at != null && String(req.query.at).trim() !== '') {
    const d = new Date(String(req.query.at));
    if (Number.isNaN(d.getTime())) {
      return res.status(400).json(fail('at: неверная дата ISO-8601', 'VALIDATION'));
    }
    at = d;
  }
  try {
    const payload = await buildPurchaseNeedSnapshotPayload(prisma, String(branchId), String(date), { at });
    res.json(ok(payload));
  } catch (e) {
    res.status(500).json(fail(e.message || 'Server error', 'INTERNAL'));
  }
});

/**
 * CRM: ручное списание со склада по выпуску (рецепт × порции). Без confirm:true — только превью.
 * POST /api/production-writeoff  body: { branchId, date, positions: [{ menuDayItemId?, position?, writeoffQty }], confirm?: boolean }
 */
app.post('/api/production-writeoff', requireCrmToken, async (req, res) => {
  const body = req.body || {};
  const branchId = body.branchId != null ? String(body.branchId).trim() : '';
  const date = body.date != null ? String(body.date).trim() : '';
  const positions = body.positions;
  const confirm = body.confirm === true;

  if (!branchId || !date) {
    return res.status(400).json(fail('branchId и date обязательны'));
  }
  try {
    const note = body.note;
    const data = await runProductionWriteoff(prisma, branchId, date, positions, { confirm, note });
    res.json(ok(data));
  } catch (e) {
    const code = e.code === 'NOT_FOUND' ? 'NOT_FOUND' : e.code === 'VALIDATION' ? 'VALIDATION' : 'INTERNAL';
    const status = code === 'NOT_FOUND' ? 404 : code === 'VALIDATION' ? 400 : 500;
    res.status(status).json(fail(e.message || 'production-writeoff failed', code));
  }
});

/**
 * CRM: upsert one menu-day slot. If body includes dishVersionId: non-null → snapshot at server now(); null → clear economics. If dishVersionId omitted → preserve existing economics on update.
 * PUT /api/menu-day-items/upsert  body: { branchId, date, position, name, price, dishVersionId?: string|null }
 */
app.put('/api/menu-day-items/upsert', requireCrmToken, async (req, res) => {
  const body = req.body || {};
  const { branchId, date, position, name, price, dishVersionId } = body;
  if (!branchId || !date || position == null || !name) {
    return res.status(400).json(fail('branchId, date, position, name required'));
  }
  if (price == null || !Number.isFinite(Number(price)) || Number(price) < 0) {
    return res.status(400).json(fail('price required (kopeks, >= 0)'));
  }
  const pos = Number(position);
  if (!Number.isInteger(pos) || pos < 1 || pos > 99) {
    return res.status(400).json(fail('position must be integer 1..99'));
  }

  const whereUnique = {
    branchId_date_position: {
      branchId: String(branchId),
      date: String(date),
      position: pos
    }
  };

  /** If body omits `dishVersionId`, keep existing snapshot fields on update; on create, leave economics null. */
  let econ;
  try {
    if (Object.prototype.hasOwnProperty.call(body, 'dishVersionId')) {
      econ = await resolveMenuDayEconomicsFields(prisma, dishVersionId);
    } else {
      const existing = await prisma.menuDayItem.findUnique({ where: whereUnique });
      if (existing) {
        econ = {
          dishVersionId: existing.dishVersionId,
          foodCostKopeksSnapshot: existing.foodCostKopeksSnapshot,
          foodCostSnapshottedAt: existing.foodCostSnapshottedAt
        };
      } else {
        econ = await resolveMenuDayEconomicsFields(prisma, null);
      }
    }
  } catch (e) {
    return res.status(400).json(fail(e.message || 'Economics resolution failed', 'MENU_ECONOMICS_ERROR'));
  }

  try {
    const row = await prisma.menuDayItem.upsert({
      where: whereUnique,
      create: {
        branchId: String(branchId),
        date: String(date),
        position: pos,
        name: String(name).trim().slice(0, 400),
        price: Math.floor(Number(price)),
        dishVersionId: econ.dishVersionId,
        foodCostKopeksSnapshot: econ.foodCostKopeksSnapshot,
        foodCostSnapshottedAt: econ.foodCostSnapshottedAt
      },
      update: {
        name: String(name).trim().slice(0, 400),
        price: Math.floor(Number(price)),
        dishVersionId: econ.dishVersionId,
        foodCostKopeksSnapshot: econ.foodCostKopeksSnapshot,
        foodCostSnapshottedAt: econ.foodCostSnapshottedAt
      }
    });
    res.json(ok(toProtectedMenuDayItem(row)));
  } catch (e) {
    res.status(500).json(fail(e.message || 'upsert failed', 'INTERNAL'));
  }
});

app.get('/api/debug/food-cost', requireCrmToken, async (req, res) => {
  const versionId = req.query.versionId;
  const atRaw = req.query.at;
  if (!versionId) {
    return res.status(400).json(fail('versionId required'));
  }
  const at = atRaw ? new Date(String(atRaw)) : new Date();
  if (Number.isNaN(at.getTime())) {
    return res.status(400).json(fail('Invalid at (use ISO-8601)'));
  }
  try {
    const breakdown = await foodCostBreakdownKopeks(prisma, String(versionId), at);
    res.json(
      ok({
        dishVersionId: String(versionId),
        at: at.toISOString(),
        totalKopeks: breakdown.totalKopeks,
        lines: breakdown.lines
      })
    );
  } catch (e) {
    res.status(400).json(fail(e.message || 'food cost failed', 'FOOD_COST_ERROR'));
  }
});

app.listen(PORT, () => {
  console.log(`crm-mvp backend http://localhost:${PORT}`);
});
