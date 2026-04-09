import 'dotenv/config';
import express from 'express';
import { PrismaClient } from '@prisma/client';
import { sanitizeAttribution, parseAttributionJson } from './attribution.js';
import { computeQuoteKopeks } from './pricing.js';
import { buildLaunchKpiPayload } from './launchKpis.js';
import {
  aggregateDailyOps,
  buildCompareDeltas,
  fetchOrdersForDailyOps
} from './dailyOpsAnalytics.js';
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
import { createVkCustomersRouter } from './vkCustomersRoutes.js';
import { getCurrentVkMenuDailyItem, formatVkMenuMessage } from './vkMenuContent.js';
import { loadOrderableMenuRows } from './vkOrderMenu.js';
import { serverLocalTomorrowISO } from './vkOrderDates.js';
import { startVkLongPoll } from './vkLongPoll.js';
import * as ReadinessRu from './messages/readinessRu.js';
import {
  logDatabaseEnvAtStartup,
  assertProductionDatabaseHasBranches,
  getHealthDbExtras
} from './databaseEnv.js';
import {
  createDeliveryOrderFromInput,
  normalizePhone,
  isAllowedStatus,
  isAllowedStatusTransition
} from './deliveryOrderService.js';
import { createCorsMiddleware } from './corsConfig.js';
import { validateProductionLikeConfig, warnWeakDevConfig } from './configStartup.js';
import {
  createPublicOrderRateLimit,
  requirePublicOrderJsonContentType,
  checkPublicOrderHoneypot,
  guardPublicOrderFieldLengths,
  guardCorporateLeadFieldLengths
} from './publicOrderGuards.js';
import {
  listCorporateLeads,
  listCompanyAccounts,
  createCorporateLeadCrm,
  createCorporateLeadPublic,
  patchCorporateLead,
  convertLeadToCompany,
  createCompanyAccount,
  patchCompanyAccount,
  addCompanyContact
} from './corporateB2bService.js';

logDatabaseEnvAtStartup();
warnWeakDevConfig();

const prisma = new PrismaClient();
const app = express();
const PORT = Number(process.env.PORT || 4000);
const IS_PRODUCTION_LIKE = process.env.NODE_ENV === 'production' || process.env.POLDEN_PRODUCTION_LIKE === '1';
const CRM_TOKEN = (process.env.CRM_INTERNAL_TOKEN || (IS_PRODUCTION_LIKE ? '' : 'dev')).trim();

if (process.env.POLDEN_TRUST_PROXY === '1') {
  app.set('trust proxy', 1);
}

const publicRateWindowMs = Number(process.env.PUBLIC_ORDER_RATE_WINDOW_MS || 60_000);
const publicQuoteRateMax = Number(process.env.PUBLIC_ORDER_QUOTE_RATE_MAX || 45);
const publicCreateRateMax = Number(process.env.PUBLIC_ORDER_CREATE_RATE_MAX || 25);
const publicOrderQuoteRateLimit = createPublicOrderRateLimit({
  windowMs: publicRateWindowMs,
  max: Number.isFinite(publicQuoteRateMax) ? publicQuoteRateMax : 45,
  name: 'pub-quote'
});
const publicOrderCreateRateLimit = createPublicOrderRateLimit({
  windowMs: publicRateWindowMs,
  max: Number.isFinite(publicCreateRateMax) ? publicCreateRateMax : 25,
  name: 'pub-create'
});

app.use(createCorsMiddleware());
app.use(requirePublicOrderJsonContentType);
app.use(express.json({ limit: '256kb' }));

function ok(data) {
  return { ok: true, data };
}
function fail(message, code = 'BAD_REQUEST') {
  return { ok: false, error: { message, code } };
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
    status: order.status ?? 'NEW',
    sourceChannel: order.sourceChannel ?? 'SITE',
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
    attribution: parseAttributionJson(order.attributionJson),
    vkLeadId: order.leadConversion?.id ?? null,
    companyAccountId: order.companyAccountId ?? null
  };
}

app.get('/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    const extras = await getHealthDbExtras(prisma);
    res.json(ok({ status: 'healthy', dbConnected: true, ...extras }));
  } catch (e) {
    res.status(503).json(fail(e.message || 'unhealthy', 'UNHEALTHY'));
  }
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

// --- Order Window (окно приёма заказов) ---

/**
 * Екатеринбург UTC+5.
 * Окно приёма закрывается в день ПЕРЕД доставкой в 21:00 Екб (= 16:00 UTC).
 * deliveryDate — дата доставки (завтра). closesAt = deliveryDate МИНУС 1 день, 21:00 Екб.
 */
function orderWindowClosesAt(deliveryDate) {
  const [y, m, d] = deliveryDate.split('-').map(Number);
  // closesAt = (deliveryDate - 1 день) 21:00 Екб = 16:00 UTC
  const dt = new Date(Date.UTC(y, m - 1, d, 16, 0, 0));
  dt.setUTCDate(dt.getUTCDate() - 1);
  return dt;
}

/** Проверка: deliveryDate — выходной (сб/вс по Екб)? */
function isWeekendEkb(deliveryDate) {
  const [y, m, d] = deliveryDate.split('-').map(Number);
  // Берём полдень по Екб (07:00 UTC) чтобы гарантированно попасть в нужный день
  const dt = new Date(Date.UTC(y, m - 1, d, 7, 0, 0));
  const dow = dt.getUTCDay(); // 0=вс, 6=сб
  return dow === 0 || dow === 6;
}

async function hasPublishedMenuDay(branchId, deliveryDate) {
  const row = await prisma.menuDayItem.findFirst({
    where: { branchId: String(branchId), date: String(deliveryDate) },
    select: { id: true }
  });
  return row != null;
}

async function getOrderWindowState(branchId, deliveryDate) {
  const normalizedBranchId = String(branchId);
  const normalizedDate = String(deliveryDate);
  const [win, menuReady] = await Promise.all([
    prisma.orderWindow.findUnique({
      where: {
        branchId_deliveryDate: {
          branchId: normalizedBranchId,
          deliveryDate: normalizedDate
        }
      }
    }),
    hasPublishedMenuDay(normalizedBranchId, normalizedDate)
  ]);

  if (!win) {
    return {
      exists: false,
      accepting: false,
      reason: menuReady ? 'no_window' : 'menu_unpublished',
      menuReady,
      closesAt: null,
      openedAt: null,
      manuallyClosed: false
    };
  }

  const now = new Date();
  const accepting = menuReady && !win.manuallyClosed && now < win.closesAt;
  const reason = !menuReady
    ? 'menu_unpublished'
    : win.manuallyClosed
      ? 'manually_closed'
      : now >= win.closesAt
        ? 'expired'
        : 'open';

  return {
    exists: true,
    accepting,
    reason,
    menuReady,
    closesAt: win.closesAt,
    openedAt: win.openedAt,
    manuallyClosed: win.manuallyClosed
  };
}

app.get('/api/public/order-window', async (req, res) => {
  const branchId = req.query.branchId;
  const date = req.query.date;
  if (!branchId || !date) {
    return res.status(400).json(fail('Укажите branchId и date'));
  }
  try {
    const state = await getOrderWindowState(branchId, date);
    res.json(ok({
      accepting: state.accepting,
      reason: state.reason,
      menuReady: state.menuReady,
      closesAt: state.closesAt ? state.closesAt.toISOString() : null
    }));
  } catch (e) {
    res.status(500).json(fail(e.message || 'Server error', 'INTERNAL'));
  }
});

app.post(
  '/api/public/delivery-orders/quote',
  publicOrderQuoteRateLimit,
  async (req, res) => {
    const { branchId, deliveryDate, items } = req.body || {};
    try {
      const q = await computeQuoteKopeks(prisma, branchId, deliveryDate, items);
      res.json(ok(q));
    } catch (e) {
      res.status(400).json(fail(e.message || 'Quote failed', 'QUOTE_ERROR'));
    }
  }
);

app.post(
  '/api/public/delivery-orders',
  publicOrderCreateRateLimit,
  async (req, res) => {
    const body = req.body || {};
    const hp = checkPublicOrderHoneypot(body);
    if (!hp.ok) {
      return res.status(400).json(fail(hp.message, 'SPAM_REJECTED'));
    }
    const lengths = guardPublicOrderFieldLengths(body);
    if (!lengths.ok) {
      return res.status(400).json(fail(lengths.message, 'VALIDATION'));
    }
    const attribution = sanitizeAttribution(body.attribution);
    const attributionJson = attribution ? JSON.stringify(attribution) : null;

    // --- Order window guard: заказы принимаются только при открытом окне ---
    if (body.branchId && body.deliveryDate) {
      try {
        const state = await getOrderWindowState(body.branchId, body.deliveryDate);
        if (!state.accepting) {
          return res.status(403).json(fail(
            'Приём заказов на эту дату сейчас закрыт. Меню ещё не опубликовано или время приёма истекло.',
            'ORDER_WINDOW_CLOSED'
          ));
        }
      } catch (e) {
        // Если таблица ещё не создана (миграция не применена) — пропускаем guard
        if (!String(e.message).includes('orderWindow')) throw e;
      }
    }

    try {
      const order = await createDeliveryOrderFromInput(prisma, {
        branchId: body.branchId,
        deliveryDate: body.deliveryDate,
        customerName: lengths.trimmed.customerName,
        customerPhone: lengths.trimmed.customerPhone,
        items: body.items,
        address: lengths.trimmed.address,
        comment: lengths.trimmed.comment,
        paymentType: body.paymentType,
        attributionJson,
        status: 'NEW',
        sourceChannel: 'SITE',
        linkVkLeadId: null
      });
      res.json(ok(toPublicOrder(order)));
    } catch (e) {
      const code = e.code || 'CREATE_ERROR';
      if (code === 'VALIDATION') return res.status(400).json(fail(e.message, 'VALIDATION'));
      if (code === 'ORDER_ITEMS') return res.status(400).json(fail(e.message, 'ORDER_ITEMS'));
      res.status(500).json(fail(e.message || 'Не удалось создать заказ', 'CREATE_ERROR'));
    }
  }
);

/**
 * Публичная заявка на корпоративные обеды (лид B2B). Те же rate limit / JSON / honeypot, что у заказа.
 */
app.post('/api/public/corporate-leads', publicOrderCreateRateLimit, async (req, res) => {
  const body = req.body || {};
  const hp = checkPublicOrderHoneypot(body);
  if (!hp.ok) {
    return res.status(400).json(fail(hp.message, 'SPAM_REJECTED'));
  }
  const lengths = guardCorporateLeadFieldLengths(body);
  if (!lengths.ok) {
    return res.status(400).json(fail(lengths.message, 'VALIDATION'));
  }
  try {
    const row = await createCorporateLeadPublic(prisma, lengths.trimmed);
    res.json(ok({ id: row.id, received: true }));
  } catch (e) {
    const code = e.code || 'CREATE_ERROR';
    if (code === 'VALIDATION') return res.status(400).json(fail(e.message, 'VALIDATION'));
    res.status(500).json(fail(e.message || 'Не удалось сохранить заявку', 'INTERNAL'));
  }
});

function requireCrmToken(req, res, next) {
  if (!CRM_TOKEN) {
    return res.status(503).json(fail('CRM internal token is not configured', 'CONFIG'));
  }
  const t = req.headers['x-crm-token'];
  if (t !== CRM_TOKEN) {
    return res.status(401).json(fail('Нужен заголовок X-CRM-Token', 'UNAUTHORIZED'));
  }
  next();
}

// --- CRM: Order Window management ---

/** Открыть приём заказов на дату доставки. closesAt = день до доставки 21:00 Екб. */
app.post('/api/order-window/open', requireCrmToken, async (req, res) => {
  const { branchId, deliveryDate } = req.body || {};
  if (!branchId || !deliveryDate) {
    return res.status(400).json(fail('Нужны branchId и deliveryDate'));
  }
  try {
    if (isWeekendEkb(deliveryDate)) {
      return res.status(400).json(fail(
        'По выходным мы не работаем. Выберите будний день.',
        'WEEKEND_BLOCKED'
      ));
    }
    const menuReady = await hasPublishedMenuDay(branchId, deliveryDate);
    if (!menuReady) {
      return res.status(400).json(fail(
        'Нельзя открыть приём заказов до публикации меню на эту дату.',
        'MENU_DAY_REQUIRED'
      ));
    }
    const closesAt = orderWindowClosesAt(deliveryDate);
    const now = new Date();
    if (now >= closesAt) {
      return res.status(400).json(fail(
        'Нельзя открыть окно: 21:00 накануне доставки уже прошло',
        'WINDOW_EXPIRED'
      ));
    }
    const win = await prisma.orderWindow.upsert({
      where: { branchId_deliveryDate: { branchId, deliveryDate } },
      create: { branchId, deliveryDate, openedAt: now, closesAt, manuallyClosed: false },
      update: { openedAt: now, closesAt, manuallyClosed: false }
    });
    res.json(ok({
      id: win.id,
      accepting: true,
      openedAt: win.openedAt.toISOString(),
      closesAt: win.closesAt.toISOString()
    }));
  } catch (e) {
    res.status(500).json(fail(e.message || 'Server error', 'INTERNAL'));
  }
});

/** Закрыть приём заказов вручную (досрочно). */
app.post('/api/order-window/close', requireCrmToken, async (req, res) => {
  const { branchId, deliveryDate } = req.body || {};
  if (!branchId || !deliveryDate) {
    return res.status(400).json(fail('Нужны branchId и deliveryDate'));
  }
  try {
    const win = await prisma.orderWindow.findUnique({
      where: { branchId_deliveryDate: { branchId, deliveryDate } }
    });
    if (!win) {
      return res.status(404).json(fail('Окно не найдено', 'NOT_FOUND'));
    }
    const updated = await prisma.orderWindow.update({
      where: { id: win.id },
      data: { manuallyClosed: true }
    });
    res.json(ok({ accepting: false, manuallyClosed: true, closesAt: updated.closesAt.toISOString() }));
  } catch (e) {
    res.status(500).json(fail(e.message || 'Server error', 'INTERNAL'));
  }
});

/** Статус окна заказов для CRM (с доп. полями). */
app.get('/api/order-window', requireCrmToken, async (req, res) => {
  const branchId = req.query.branchId;
  const date = req.query.date;
  if (!branchId || !date) {
    return res.status(400).json(fail('Укажите branchId и date'));
  }
  try {
    const state = await getOrderWindowState(branchId, date);
    if (!state.exists) {
      return res.json(ok({
        exists: false,
        accepting: false,
        reason: state.reason,
        menuReady: state.menuReady
      }));
    }
    res.json(ok({
      exists: true,
      accepting: state.accepting,
      reason: state.reason,
      menuReady: state.menuReady,
      manuallyClosed: state.manuallyClosed,
      openedAt: state.openedAt.toISOString(),
      closesAt: state.closesAt.toISOString()
    }));
  } catch (e) {
    res.status(500).json(fail(e.message || 'Server error', 'INTERNAL'));
  }
});

app.post('/api/delivery-orders/manual', requireCrmToken, async (req, res) => {
  const body = req.body || {};
  const attr = sanitizeAttribution(body.attribution);
  const attributionJson = attr ? JSON.stringify(attr) : null;
  const linkVkLeadId = body.vkLeadId != null && String(body.vkLeadId).trim() ? String(body.vkLeadId).trim() : null;
  const linkCompanyAccountId =
    body.companyAccountId != null && String(body.companyAccountId).trim()
      ? String(body.companyAccountId).trim()
      : null;

  try {
    const order = await createDeliveryOrderFromInput(prisma, {
      branchId: body.branchId,
      deliveryDate: body.deliveryDate,
      customerName: body.customerName,
      customerPhone: body.customerPhone,
      items: body.items,
      address: body.address,
      comment: body.comment,
      paymentType: body.paymentType,
      attributionJson,
      status: body.status != null ? String(body.status).trim() : 'NEW',
      sourceChannel: body.sourceChannel != null ? String(body.sourceChannel).trim() : 'MANUAL',
      linkVkLeadId,
      linkCompanyAccountId
    });
    const full = await prisma.deliveryOrder.findUnique({
      where: { id: order.id },
      include: { branch: true, items: true, leadConversion: { select: { id: true } } }
    });
    res.json(ok(toProtectedOrder(full)));
  } catch (e) {
    const code = e.code || 'CREATE_ERROR';
    if (code === 'VALIDATION') return res.status(400).json(fail(e.message, 'VALIDATION'));
    if (code === 'ORDER_ITEMS') return res.status(400).json(fail(e.message, 'ORDER_ITEMS'));
    if (code === 'NOT_FOUND') return res.status(404).json(fail(e.message, 'NOT_FOUND'));
    if (code === 'CONFLICT') return res.status(409).json(fail(e.message, 'CONFLICT'));
    res.status(500).json(fail(e.message || 'Не удалось создать заказ', 'CREATE_ERROR'));
  }
});

app.patch('/api/delivery-orders/:id/status', requireCrmToken, async (req, res) => {
  const id = req.params.id != null ? String(req.params.id).trim() : '';
  if (!id) return res.status(400).json(fail('id required', 'VALIDATION'));
  const status = req.body?.status != null ? String(req.body.status).trim() : '';
  if (!isAllowedStatus(status)) {
    return res.status(400).json(fail('Недопустимый status', 'VALIDATION'));
  }
  try {
    const current = await prisma.deliveryOrder.findUnique({ where: { id } });
    if (!current) return res.status(404).json(fail('Заказ не найден', 'NOT_FOUND'));
    if (!isAllowedStatusTransition(current.status, status)) {
      return res.status(400).json(
        fail(`Переход ${current.status} → ${status} не разрешён`, 'TRANSITION')
      );
    }
    const order = await prisma.deliveryOrder.update({
      where: { id },
      data: { status },
      include: { branch: true, items: true, leadConversion: { select: { id: true } } }
    });
    res.json(ok(toProtectedOrder(order)));
  } catch (e) {
    res.status(500).json(fail(e.message || 'update failed', 'INTERNAL'));
  }
});

/** B2B: компании и заявки на корпоративные обеды (CRM token). */
app.delete('/api/delivery-orders/:id', requireCrmToken, async (req, res) => {
  const id = req.params.id != null ? String(req.params.id).trim() : '';
  if (!id) return res.status(400).json(fail('id required', 'VALIDATION'));
  try {
    const current = await prisma.deliveryOrder.findUnique({
      where: { id },
      include: { leadConversion: { select: { id: true } } }
    });
    if (!current) return res.status(404).json(fail('Заказ не найден', 'NOT_FOUND'));
    if (!['CANCELED', 'CANCELLED'].includes(String(current.status || ''))) {
      return res.status(400).json(fail('Удалять можно только отменённые заказы', 'VALIDATION'));
    }
    await prisma.$transaction(async (tx) => {
      if (current.leadConversion?.id) {
        await tx.vkLead.update({
          where: { id: current.leadConversion.id },
          data: { convertedOrderId: null }
        });
      }
      await tx.deliveryOrderItem.deleteMany({ where: { orderId: id } });
      await tx.deliveryOrder.delete({ where: { id } });
    });
    res.json(ok({ id, deleted: true }));
  } catch (e) {
    res.status(500).json(fail(e.message || 'delete failed', 'INTERNAL'));
  }
});

app.get('/api/company-accounts', requireCrmToken, async (req, res) => {
  try {
    const data = await listCompanyAccounts(prisma, {
      status: req.query.status,
      q: req.query.q
    });
    res.json(ok(data));
  } catch (e) {
    res.status(500).json(fail(e.message || 'Server error', 'INTERNAL'));
  }
});

app.post('/api/company-accounts', requireCrmToken, async (req, res) => {
  try {
    const row = await createCompanyAccount(prisma, req.body || {});
    res.json(ok(row));
  } catch (e) {
    const code = e.code || 'BAD_REQUEST';
    if (code === 'VALIDATION') return res.status(400).json(fail(e.message, 'VALIDATION'));
    res.status(500).json(fail(e.message || 'Server error', 'INTERNAL'));
  }
});

app.patch('/api/company-accounts/:id', requireCrmToken, async (req, res) => {
  const id = req.params.id != null ? String(req.params.id).trim() : '';
  if (!id) return res.status(400).json(fail('id required', 'VALIDATION'));
  try {
    const row = await patchCompanyAccount(prisma, id, req.body || {});
    res.json(ok(row));
  } catch (e) {
    const code = e.code || 'BAD_REQUEST';
    if (code === 'NOT_FOUND') return res.status(404).json(fail(e.message, 'NOT_FOUND'));
    if (code === 'VALIDATION') return res.status(400).json(fail(e.message, 'VALIDATION'));
    res.status(500).json(fail(e.message || 'Server error', 'INTERNAL'));
  }
});

app.post('/api/company-accounts/:id/contacts', requireCrmToken, async (req, res) => {
  const id = req.params.id != null ? String(req.params.id).trim() : '';
  if (!id) return res.status(400).json(fail('id required', 'VALIDATION'));
  try {
    const row = await addCompanyContact(prisma, id, req.body || {});
    res.json(ok(row));
  } catch (e) {
    const code = e.code || 'BAD_REQUEST';
    if (code === 'NOT_FOUND') return res.status(404).json(fail(e.message, 'NOT_FOUND'));
    if (code === 'VALIDATION') return res.status(400).json(fail(e.message, 'VALIDATION'));
    res.status(500).json(fail(e.message || 'Server error', 'INTERNAL'));
  }
});

app.get('/api/corporate-leads', requireCrmToken, async (req, res) => {
  try {
    const data = await listCorporateLeads(prisma, {
      status: req.query.status,
      city: req.query.city,
      q: req.query.q
    });
    res.json(ok(data));
  } catch (e) {
    res.status(500).json(fail(e.message || 'Server error', 'INTERNAL'));
  }
});

app.post('/api/corporate-leads', requireCrmToken, async (req, res) => {
  try {
    const row = await createCorporateLeadCrm(prisma, req.body || {});
    res.json(ok(row));
  } catch (e) {
    const code = e.code || 'BAD_REQUEST';
    if (code === 'VALIDATION') return res.status(400).json(fail(e.message, 'VALIDATION'));
    res.status(500).json(fail(e.message || 'Server error', 'INTERNAL'));
  }
});

app.patch('/api/corporate-leads/:id', requireCrmToken, async (req, res) => {
  const id = req.params.id != null ? String(req.params.id).trim() : '';
  if (!id) return res.status(400).json(fail('id required', 'VALIDATION'));
  try {
    const row = await patchCorporateLead(prisma, id, req.body || {});
    res.json(ok(row));
  } catch (e) {
    const code = e.code || 'BAD_REQUEST';
    if (code === 'NOT_FOUND') return res.status(404).json(fail(e.message, 'NOT_FOUND'));
    if (code === 'VALIDATION') return res.status(400).json(fail(e.message, 'VALIDATION'));
    res.status(500).json(fail(e.message || 'Server error', 'INTERNAL'));
  }
});

app.post('/api/corporate-leads/:id/convert-to-company', requireCrmToken, async (req, res) => {
  const id = req.params.id != null ? String(req.params.id).trim() : '';
  if (!id) return res.status(400).json(fail('id required', 'VALIDATION'));
  try {
    const body = req.body || {};
    const data = await convertLeadToCompany(prisma, id, {
      defaultBranchId: body.defaultBranchId
    });
    res.json(ok(data));
  } catch (e) {
    const code = e.code || 'BAD_REQUEST';
    if (code === 'NOT_FOUND') return res.status(404).json(fail(e.message, 'NOT_FOUND'));
    if (code === 'CONFLICT') return res.status(409).json(fail(e.message, 'CONFLICT'));
    if (code === 'VALIDATION') return res.status(400).json(fail(e.message, 'VALIDATION'));
    res.status(500).json(fail(e.message || 'Server error', 'INTERNAL'));
  }
});

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

    const tomorrowIso = serverLocalTomorrowISO();
    const probeBranchIdEnv = (process.env.POLDEN_VK_ORDER_PROBE_BRANCH_ID || '').trim();
    let probeBranch = null;
    if (probeBranchIdEnv) {
      probeBranch = await prisma.branch.findUnique({ where: { id: probeBranchIdEnv } });
    }
    if (!probeBranch) {
      const probeBranches = await prisma.branch.findMany({ orderBy: { name: 'asc' }, take: 1 });
      probeBranch = probeBranches[0] || null;
    }
    /** @type {{ deliveryDate: string, branchId: string | null, branchName: string | null, sellableSlotCount: number, ready: boolean, probeNote: string }} */
    let vkOrderableMenu = {
      deliveryDate: tomorrowIso,
      branchId: null,
      branchName: null,
      sellableSlotCount: 0,
      ready: false,
      probeNote: probeBranchIdEnv
        ? `Точка из POLDEN_VK_ORDER_PROBE_BRANCH_ID${probeBranch ? '' : ' (id не найден — fallback A→Я)'}.`
        : 'Проверка по первой точке по имени (A→Я); задать POLDEN_VK_ORDER_PROBE_BRANCH_ID для своей точки.'
    };
    if (probeBranch) {
      const rows = await loadOrderableMenuRows(prisma, probeBranch.id, tomorrowIso);
      vkOrderableMenu = {
        deliveryDate: tomorrowIso,
        branchId: probeBranch.id,
        branchName: probeBranch.name,
        sellableSlotCount: rows.length,
        ready: rows.length > 0,
        probeNote: vkOrderableMenu.probeNote
      };
    }
    const vkStructuredOrderReady = Boolean(vkCoreEnvOk && vkOrderableMenu.ready);
    const vkStructuredOrderBlockers = [
      !token.length ? ReadinessRu.BLOCKER_NO_GROUP_TOKEN : null,
      !conf.length ? ReadinessRu.BLOCKER_NO_CONFIRMATION : null,
      !probeBranch ? ReadinessRu.BLOCKER_NO_BRANCH_IN_DB : null,
      probeBranch && !vkOrderableMenu.ready ? ReadinessRu.BLOCKER_VK_ORDERABLE_MENU_EMPTY : null
    ].filter(Boolean);

    res.json(
      ok({
        vkWebhookSecretConfigured: secret.length > 0,
        vkGroupAccessTokenConfigured: token.length > 0,
        vkCallbackConfirmationConfigured: conf.length > 0,
        crmInternalTokenFromEnv,
        crmTokenConsistentHint: ReadinessRu.CRM_TOKEN_HINT,
        vkOperatorDiagnostics: {
          hints: [
            ReadinessRu.VK_DIAG_LEAD_ACCEPTED_EXPLANATION,
            ReadinessRu.VK_DIAG_ORDER_BUTTON_RESETS_LEAD,
            vkStructuredOrderReady
              ? null
              : 'Пока vkStructuredOrderReady=false, после «Оформить заказ» бот сообщит, что меню на завтра пусто, и предложит заявку — это блокер данных CRM, не «старый код».'
          ].filter(Boolean)
        },
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
        ].filter(Boolean),
        vkOrderableMenu,
        vkStructuredOrderReady,
        vkStructuredOrderBlockers
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

/**
 * Публикация меню в ВК: генерирует ContentItem из MenuDayItem + авто-открывает OrderWindow.
 * Вызывается из CRM при нажатии «Опубликовать в ВК».
 */
app.post('/api/vk/publish-menu', requireCrmToken, async (req, res) => {
  const { branchId, date } = req.body || {};
  if (!branchId || !date) {
    return res.status(400).json(fail('Нужны branchId и date'));
  }
  try {
    // 1. Загружаем позиции меню
    const rows = await loadOrderableMenuRows(prisma, branchId, date);
    if (!rows.length) {
      return res.status(400).json(fail('Меню на эту дату пусто — нечего публиковать.', 'MENU_EMPTY'));
    }

    // 2. Формируем текст меню
    const lines = rows.map((r) => {
      const rub = (Number(r.price) / 100).toLocaleString('ru-RU', { maximumFractionDigits: 0 });
      return `${r.position}. ${String(r.name).trim()} — ${rub} ₽`;
    });
    const menuText = `Меню на ${date}:\n${lines.join('\n')}`;
    const title = `Меню на доставку ${date}`;

    // 3. Upsert ContentItem (канал VK, тип MENU_DAILY)
    const existing = await prisma.contentItem.findFirst({
      where: { channel: 'VK', contentType: 'MENU_DAILY', title: { contains: date } }
    });
    let contentItem;
    if (existing) {
      contentItem = await prisma.contentItem.update({
        where: { id: existing.id },
        data: {
          captionDraft: menuText,
          title,
          status: 'PUBLISHED',
          publishDate: new Date()
        }
      });
    } else {
      contentItem = await prisma.contentItem.create({
        data: {
          channel: 'VK',
          contentType: 'MENU_DAILY',
          captionDraft: menuText,
          title,
          status: 'PUBLISHED',
          publishDate: new Date(),
          landingPath: '/landing-order/',
          utmSource: 'vk',
          utmMedium: 'bot',
          utmCampaign: `menu_${date}`
        }
      });
    }

    // 4. Авто-открываем OrderWindow (если ещё не открыто и не выходной)
    let windowResult = null;
    if (!isWeekendEkb(date)) {
      const closesAt = orderWindowClosesAt(date);
      const now = new Date();
      if (now < closesAt) {
        const win = await prisma.orderWindow.upsert({
          where: { branchId_deliveryDate: { branchId, deliveryDate: date } },
          create: { branchId, deliveryDate: date, openedAt: now, closesAt, manuallyClosed: false },
          update: { openedAt: now, closesAt, manuallyClosed: false }
        });
        windowResult = {
          accepting: true,
          closesAt: win.closesAt.toISOString()
        };
      }
    }

    res.json(ok({
      contentItemId: contentItem.id,
      menuText,
      orderWindow: windowResult
    }));
  } catch (e) {
    console.error('[vk/publish-menu]', e);
    res.status(500).json(fail(e.message || 'Server error', 'INTERNAL'));
  }
});

app.use('/api/launch-drills', requireCrmToken, createLaunchDrillRouter(prisma));

app.use('/api/vk-leads', requireCrmToken, createVkLeadRouter(prisma));
app.use('/api/vk-customers', requireCrmToken, createVkCustomersRouter(prisma));

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
      include: { branch: true, items: true, leadConversion: { select: { id: true } } }
    });
    res.json(ok(orders.map(toProtectedOrder)));
  } catch (e) {
    res.status(500).json(fail(e.message || 'Server error', 'INTERNAL'));
  }
});

/**
 * Операторский поиск заказов (CRM): телефон, имя, адрес, id. Query q < 2 символов → пустой массив.
 * branchId обязателен; date опционально — фильтр по дате доставки.
 */
app.get('/api/delivery-orders/search', requireCrmToken, async (req, res) => {
  const branchId = String(req.query.branchId || '').trim();
  const dateRaw = req.query.date != null ? String(req.query.date).trim() : '';
  const qRaw = String(req.query.q || '').trim();
  if (!branchId) {
    return res.status(400).json(fail('Укажите branchId'));
  }
  if (qRaw.length < 2) {
    return res.json(ok([]));
  }
  let limit = Number(req.query.limit ?? 40);
  if (!Number.isFinite(limit) || limit < 1) limit = 40;
  if (limit > 80) limit = 80;

  const digitQ = qRaw.replace(/\D/g, '');
  const whereBase = {
    branchId,
    ...(dateRaw ? { deliveryDate: dateRaw } : {})
  };

  const orClauses = [
    { customerName: { contains: qRaw } },
    { address: { contains: qRaw } },
    { id: { contains: qRaw } }
  ];
  if (digitQ.length >= 2) {
    orClauses.push({ customerPhone: { contains: digitQ } });
  } else {
    orClauses.push({ customerPhone: { contains: qRaw } });
  }

  try {
    const orders = await prisma.deliveryOrder.findMany({
      where: {
        ...whereBase,
        OR: orClauses
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { branch: true, items: true, leadConversion: { select: { id: true } } }
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
 * Операционная аналитика на дату доставки (DeliveryOrder).
 * GET /api/analytics/daily-ops?branchId=&date=&compareDate=
 * date по умолчанию — календарный «сегодня» на сервере (локальное время).
 */
app.get('/api/analytics/daily-ops', requireCrmToken, async (req, res) => {
  const branchId = req.query.branchId;
  if (!branchId) {
    return res.status(400).json(fail('Укажите branchId'));
  }
  let date = String(req.query.date || '').trim();
  if (!date) {
    const d = new Date();
    date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  const compareDateRaw = String(req.query.compareDate || '').trim();
  const compareDate = compareDateRaw || null;

  try {
    const [primaryRows, compareRows] = await Promise.all([
      fetchOrdersForDailyOps(prisma, branchId, date),
      compareDate ? fetchOrdersForDailyOps(prisma, branchId, compareDate) : Promise.resolve(null)
    ]);
    const primary = aggregateDailyOps(primaryRows, branchId, date);
    if (!compareDate || !compareRows) {
      return res.json(ok({ primary, compare: null, deltas: null }));
    }
    const compare = aggregateDailyOps(compareRows, branchId, compareDate);
    const deltas = buildCompareDeltas(primary, compare);
    return res.json(ok({ primary, compare, deltas }));
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

async function startServer() {
  validateProductionLikeConfig();
  try {
    await prisma.$connect();
    await assertProductionDatabaseHasBranches(prisma);
  } catch (e) {
    console.error(e?.message || e);
    process.exit(1);
  }
  app.listen(PORT, () => {
    console.log(`crm-mvp backend http://localhost:${PORT}`);
    startVkLongPoll(prisma).catch(e => console.error("[vk-longpoll] fatal:", e));
  });
}

startServer();
