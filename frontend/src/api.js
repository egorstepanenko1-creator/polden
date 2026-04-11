const TOKEN = import.meta.env.VITE_CRM_TOKEN || 'dev';

/** Пусто → относительные URL `/api/...` (Vite proxy / тот же origin). Иначе абсолютный origin прод/stage API. */
const API_BASE = (import.meta.env.VITE_API_BASE || '').trim().replace(/\/$/, '');

/** @param {string} resourcePath путь вида `/api/...` */
function apiUrl(resourcePath) {
  const p = resourcePath.startsWith('/') ? resourcePath : `/${resourcePath}`;
  if (!API_BASE) return p;
  return `${API_BASE}${p}`;
}

/** @param {string} path @param {{ method?: string, body?: object }} [opts] */
async function crmFetch(path, opts = {}) {
  const res = await fetch(apiUrl(path), {
    method: opts.method || 'GET',
    headers: {
      Accept: 'application/json',
      'X-CRM-Token': TOKEN,
      ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {})
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) {
    const code = json?.error?.code;
    const msg = json?.error?.message || `HTTP ${res.status}`;
    throw new Error(code ? `${msg} (${code})` : msg);
  }
  return json.data;
}

// --- Kitchen Catalog API v1 (/api/kitchen/*) ---

export async function fetchKitchenUnits() {
  return crmFetch('/api/kitchen/units');
}

export async function createKitchenUnit(body) {
  return crmFetch('/api/kitchen/units', { method: 'POST', body });
}

export async function fetchKitchenIngredients() {
  return crmFetch('/api/kitchen/ingredients');
}

export async function createKitchenIngredient(body) {
  return crmFetch('/api/kitchen/ingredients', { method: 'POST', body });
}

export async function patchKitchenIngredient(ingredientId, body) {
  return crmFetch(`/api/kitchen/ingredients/${encodeURIComponent(ingredientId)}`, { method: 'PATCH', body });
}

export async function fetchKitchenIngredientPrices(ingredientId) {
  return crmFetch(`/api/kitchen/ingredients/${encodeURIComponent(ingredientId)}/prices`);
}

export async function createKitchenIngredientPrice(ingredientId, body) {
  return crmFetch(`/api/kitchen/ingredients/${encodeURIComponent(ingredientId)}/prices`, { method: 'POST', body });
}

export async function fetchKitchenDishes() {
  return crmFetch('/api/kitchen/dishes');
}

export async function createKitchenDish(body) {
  return crmFetch('/api/kitchen/dishes', { method: 'POST', body });
}

export async function fetchKitchenDishVersions(dishId) {
  return crmFetch(`/api/kitchen/dishes/${encodeURIComponent(dishId)}/versions`);
}

export async function createKitchenDishVersion(dishId, body) {
  return crmFetch(`/api/kitchen/dishes/${encodeURIComponent(dishId)}/versions`, { method: 'POST', body });
}

export async function fetchKitchenDishVersion(versionId) {
  return crmFetch(`/api/kitchen/dish-versions/${encodeURIComponent(versionId)}`);
}

export async function putKitchenDishVersionIngredients(versionId, lines) {
  return crmFetch(`/api/kitchen/dish-versions/${encodeURIComponent(versionId)}/ingredients`, {
    method: 'PUT',
    body: { lines }
  });
}

export async function publishKitchenDishVersion(versionId) {
  return crmFetch(`/api/kitchen/dish-versions/${encodeURIComponent(versionId)}/publish`, { method: 'POST', body: {} });
}

// --- Menu day (protected, economics fields on read/upsert) ---

export async function fetchMenuDayItems(branchId, date) {
  const q = new URLSearchParams({ branchId, date });
  return crmFetch(`/api/menu-day-items?${q}`);
}

/**
 * @param {{ branchId: string, date: string, position: number, name: string, price: number, dishVersionId?: string|null }} body
 */
export async function upsertMenuDayItem(body) {
  return crmFetch('/api/menu-day-items/upsert', { method: 'PUT', body });
}

/** Day economics: menu slots × orders for branch + date (deliveryDate). */
export async function fetchDayEconomics(branchId, date) {
  const q = new URLSearchParams({ branchId, date });
  return crmFetch(`/api/day-economics?${q}`);
}

/** Сводка потребности в ингредиентах по заказам и рецептам меню. */
export async function fetchDayProductionRequirements(branchId, date) {
  const q = new URLSearchParams({ branchId, date });
  return crmFetch(`/api/day-production-requirements?${q}`);
}

/** Потребность производства дня vs остатки склада. */
export async function fetchProductionStockGap(branchId, date) {
  const q = new URLSearchParams({ branchId, date });
  return crmFetch(`/api/production-stock-gap?${q}`);
}

/**
 * Снимок закупки: только ингредиенты с дефицитом (purchaseNeedQty > 0).
 * @param {string} [at] — ISO дата-время оценки офферов поставщиков (иначе сервер = сейчас)
 */
export async function fetchPurchaseNeedSnapshot(branchId, date, at) {
  const q = new URLSearchParams({ branchId, date });
  if (at) q.set('at', at);
  return crmFetch(`/api/purchase-need-snapshot?${q}`);
}

// --- Suppliers v1 (/api/suppliers/*) ---

export async function fetchSuppliers() {
  return crmFetch('/api/suppliers');
}

export async function createSupplier(body) {
  return crmFetch('/api/suppliers', { method: 'POST', body });
}

export async function patchSupplier(supplierId, body) {
  return crmFetch(`/api/suppliers/${encodeURIComponent(supplierId)}`, { method: 'PATCH', body });
}

export async function fetchSupplierOffers(supplierId) {
  return crmFetch(`/api/suppliers/${encodeURIComponent(supplierId)}/offers`);
}

export async function createSupplierOffer(supplierId, body) {
  return crmFetch(`/api/suppliers/${encodeURIComponent(supplierId)}/offers`, { method: 'POST', body });
}

// --- Purchase drafts v1 (/api/purchase-drafts/*) ---

export async function generatePurchaseDraft(body) {
  return crmFetch('/api/purchase-drafts/generate', { method: 'POST', body });
}

/** @param {string} [branchId] @param {string} [date] — хотя бы одно поле обязательно на бэкенде */
export async function fetchPurchaseDrafts(branchId, date) {
  const q = new URLSearchParams();
  if (branchId) q.set('branchId', branchId);
  if (date) q.set('date', date);
  return crmFetch(`/api/purchase-drafts?${q}`);
}

/**
 * Доска закупок: все фильтры опциональны; limit по умолчанию 500.
 * @param {{ branchId?: string, date?: string, receiptStatus?: 'NONE' | 'RECEIVED_PARTIAL' | 'RECEIVED_FULL', limit?: number }} filters
 */
export async function fetchProcurementBoard(filters = {}) {
  const q = new URLSearchParams();
  if (filters.branchId) q.set('branchId', filters.branchId);
  if (filters.date) q.set('date', filters.date);
  if (filters.receiptStatus) q.set('receiptStatus', filters.receiptStatus);
  if (filters.limit != null) q.set('limit', String(filters.limit));
  return crmFetch(`/api/procurement-board?${q}`);
}

export async function fetchPurchaseDraft(draftId) {
  return crmFetch(`/api/purchase-drafts/${encodeURIComponent(draftId)}`);
}

export async function patchPurchaseDraftNote(draftId, note) {
  return crmFetch(`/api/purchase-drafts/${encodeURIComponent(draftId)}`, { method: 'PATCH', body: { note } });
}

/** Приёмка по черновику: confirm:false — превью; confirm:true — RECEIPT в журнал. */
export async function postPurchaseDraftReceive(draftId, body) {
  return crmFetch(`/api/purchase-drafts/${encodeURIComponent(draftId)}/receive`, { method: 'POST', body });
}

/**
 * Ручное списание по производству. confirm:false → превью; confirm:true → движения в журнале.
 * @param {{ branchId: string, date: string, positions: Array<{ menuDayItemId?: string, position?: number, writeoffQty: number }>, confirm?: boolean }} body
 */
/** @param {{ branchId: string, date: string, positions: unknown[], confirm?: boolean, note?: string | null }} body */
export async function postProductionWriteoff(body) {
  return crmFetch('/api/production-writeoff', { method: 'POST', body });
}

/** @param {string} branchId @param {string} date */
export async function fetchProductionWriteoffBatches(branchId, date) {
  const q = new URLSearchParams({ branchId, date });
  return crmFetch(`/api/production-writeoff-batches?${q}`);
}

/** @param {string} batchId */
export async function fetchProductionWriteoffBatch(batchId) {
  return crmFetch(`/api/production-writeoff-batches/${encodeURIComponent(batchId)}`);
}

// --- Stock v1 (/api/stock/*) ---

/** @returns {Promise<{ branchId: string, balances: Array<{ ingredientId: string, ingredientName: string, unitId: string, unitCode: string, unitDisplayName: string, balance: number }> }>} */
export async function fetchStockBalances(branchId) {
  const q = new URLSearchParams({ branchId });
  return crmFetch(`/api/stock/balances?${q}`);
}

/**
 * @param {string} branchId
 * @param {{ ingredientId?: string, dateFrom?: string, dateTo?: string }} [filters]
 */
export async function fetchStockMovements(branchId, filters = {}) {
  const q = new URLSearchParams({ branchId });
  if (filters.ingredientId) q.set('ingredientId', filters.ingredientId);
  if (filters.dateFrom) q.set('dateFrom', filters.dateFrom);
  if (filters.dateTo) q.set('dateTo', filters.dateTo);
  return crmFetch(`/api/stock/movements?${q}`);
}

export async function createStockMovement(body) {
  return crmFetch('/api/stock/movements', { method: 'POST', body });
}

export async function createStockReceipt(body) {
  return crmFetch('/api/stock/receipt', { method: 'POST', body });
}

/** @returns {Promise<{ branchId: string, rows: Array<Record<string, unknown>> }>} */
export async function fetchInventoryCountSheet(branchId) {
  const q = new URLSearchParams({ branchId });
  return crmFetch(`/api/stock/inventory-count-sheet?${q}`);
}

/**
 * Инвентаризация: confirm false → превью; true → движения ADJUSTMENT_*.
 * @param {{ branchId: string, rows: Array<{ ingredientId: string, unitId: string, countedQty: number }>, confirm?: boolean, note?: string | null }} body
 */
export async function postInventoryReconcile(body) {
  return crmFetch('/api/stock/inventory-reconcile', { method: 'POST', body });
}

/** @param {string} branchId */
export async function fetchInventoryCountBatches(branchId) {
  const q = new URLSearchParams({ branchId });
  return crmFetch(`/api/stock/inventory-count-batches?${q}`);
}

/** @param {string} batchId */
export async function fetchInventoryCountBatch(batchId) {
  return crmFetch(`/api/stock/inventory-count-batches/${encodeURIComponent(batchId)}`);
}

export async function fetchBranches() {
  const res = await fetch(apiUrl('/api/public/branches'), { headers: { Accept: 'application/json' } });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) throw new Error(json?.error?.message || `HTTP ${res.status}`);
  return json.data;
}

export async function fetchDeliveryOrders(branchId, date) {
  const q = new URLSearchParams({ branchId, date });
  const res = await fetch(apiUrl(`/api/delivery-orders?${q}`), {
    headers: { 'X-CRM-Token': TOKEN, Accept: 'application/json' }
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) throw new Error(json?.error?.message || `HTTP ${res.status}`);
  return json.data;
}

/**
 * Поиск заказов (оператор). q короче 2 символов на сервере → [].
 * @param {{ branchId: string, q: string, date?: string, limit?: number }} params
 */
export async function fetchDeliveryOrdersSearch({ branchId, q, date, limit }) {
  const params = new URLSearchParams({ branchId, q: String(q || '').trim() });
  if (date) params.set('date', date);
  if (limit != null) params.set('limit', String(limit));
  const res = await fetch(apiUrl(`/api/delivery-orders/search?${params}`), {
    headers: { 'X-CRM-Token': TOKEN, Accept: 'application/json' }
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) throw new Error(json?.error?.message || `HTTP ${res.status}`);
  return json.data;
}

/** Операторский заказ: тот же pricing, что и публичный POST. */
export async function postManualDeliveryOrder(body) {
  return crmFetch('/api/delivery-orders/manual', { method: 'POST', body });
}

export async function patchDeliveryOrderStatus(orderId, status) {
  return crmFetch(`/api/delivery-orders/${encodeURIComponent(orderId)}/status`, {
    method: 'PATCH',
    body: { status }
  });
}

/** @param {{ status?: string, q?: string }} [filters] */
export async function fetchCompanyAccounts(filters = {}) {
  const q = new URLSearchParams();
  if (filters.status) q.set('status', filters.status);
  if (filters.q) q.set('q', filters.q);
  const qs = q.toString();
  return crmFetch(`/api/company-accounts${qs ? `?${qs}` : ''}`);
}

/** @param {Record<string, unknown>} body */
export async function postCompanyAccount(body) {
  return crmFetch('/api/company-accounts', { method: 'POST', body });
}

/** @param {string} id @param {Record<string, unknown>} body */
export async function patchCompanyAccount(id, body) {
  return crmFetch(`/api/company-accounts/${encodeURIComponent(id)}`, { method: 'PATCH', body });
}

/** @param {string} companyId @param {Record<string, unknown>} body */
export async function postCompanyContact(companyId, body) {
  return crmFetch(`/api/company-accounts/${encodeURIComponent(companyId)}/contacts`, {
    method: 'POST',
    body
  });
}

/** @param {{ status?: string, city?: string, q?: string }} [filters] */
export async function fetchCorporateLeads(filters = {}) {
  const q = new URLSearchParams();
  if (filters.status) q.set('status', filters.status);
  if (filters.city) q.set('city', filters.city);
  if (filters.q) q.set('q', filters.q);
  const qs = q.toString();
  return crmFetch(`/api/corporate-leads${qs ? `?${qs}` : ''}`);
}

/** @param {Record<string, unknown>} body */
export async function postCorporateLead(body) {
  return crmFetch('/api/corporate-leads', { method: 'POST', body });
}

/** @param {string} id @param {Record<string, unknown>} body */
export async function patchCorporateLead(id, body) {
  return crmFetch(`/api/corporate-leads/${encodeURIComponent(id)}`, { method: 'PATCH', body });
}

/** @param {string} leadId @param {{ defaultBranchId?: string|null }} [body] */
export async function postConvertCorporateLead(leadId, body = {}) {
  return crmFetch(`/api/corporate-leads/${encodeURIComponent(leadId)}/convert-to-company`, {
    method: 'POST',
    body
  });
}

/** @param {string} branchId @param {number} days 1..90 */
export async function fetchFoodCostKpi(branchId, days = 7) {
  const q = new URLSearchParams({ branchId, days: String(days) });
  const res = await fetch(apiUrl(`/api/dashboard/food-cost-kpi?${q}`), {
    headers: { 'X-CRM-Token': TOKEN, Accept: 'application/json' }
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) throw new Error(json?.error?.message || `HTTP ${res.status}`);
  return json.data;
}

/** @param {string} branchId @param {number} days 1..90 */
export async function fetchLaunchKpis(branchId, days = 7) {
  const q = new URLSearchParams({ branchId, days: String(days) });
  const res = await fetch(apiUrl(`/api/dashboard/launch-kpis?${q}`), {
    headers: { 'X-CRM-Token': TOKEN, Accept: 'application/json' }
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) throw new Error(json?.error?.message || `HTTP ${res.status}`);
  return json.data;
}

/**
 * Сводка операций на дату доставки + опционально сравнение с compareDate (соседний операционный день).
 * @param {string} branchId
 * @param {string} date YYYY-MM-DD
 * @param {string} [compareDate]
 */
export async function fetchDailyOpsAnalytics(branchId, date, compareDate) {
  const q = new URLSearchParams({ branchId, date });
  if (compareDate) q.set('compareDate', compareDate);
  return crmFetch(`/api/analytics/daily-ops?${q}`);
}

// --- Content Pipeline v1 (/api/content-items) ---

/** @param {{ status?: string, channel?: string, publishDate?: string }} [filters] */
export async function fetchContentItems(filters = {}) {
  const q = new URLSearchParams();
  if (filters.status) q.set('status', filters.status);
  if (filters.channel) q.set('channel', filters.channel);
  if (filters.publishDate) q.set('publishDate', filters.publishDate);
  const qs = q.toString();
  return crmFetch(`/api/content-items${qs ? `?${qs}` : ''}`);
}

/** @param {Record<string, unknown>} body */
export async function createContentItem(body) {
  return crmFetch('/api/content-items', { method: 'POST', body });
}

/** @param {string} id @param {Record<string, unknown>} body */
export async function patchContentItem(id, body) {
  return crmFetch(`/api/content-items/${encodeURIComponent(id)}`, { method: 'PATCH', body });
}

/** @param {{ status?: string, channel?: string, publishDateFrom?: string, publishDateTo?: string, hasOrders?: string }} [filters] */
export async function fetchContentPerformance(filters = {}) {
  const q = new URLSearchParams();
  if (filters.status) q.set('status', filters.status);
  if (filters.channel) q.set('channel', filters.channel);
  if (filters.publishDateFrom) q.set('publishDateFrom', filters.publishDateFrom);
  if (filters.publishDateTo) q.set('publishDateTo', filters.publishDateTo);
  if (filters.hasOrders) q.set('hasOrders', filters.hasOrders);
  const qs = q.toString();
  return crmFetch(`/api/content-performance${qs ? `?${qs}` : ''}`);
}

export async function fetchContentPipelineOriginStatus() {
  return crmFetch('/api/content-pipeline/origin-status');
}

// --- Launch drill v1 (/api/launch-drills) ---

/** @param {{ contentItemId: string }} body */
export async function startLaunchDrill(body) {
  return crmFetch('/api/launch-drills/start', { method: 'POST', body });
}

/** @param {string} id @param {Record<string, unknown>} body */
export async function completeLaunchDrill(id, body) {
  return crmFetch(`/api/launch-drills/${encodeURIComponent(id)}/complete`, { method: 'POST', body });
}

export async function fetchLaunchDrills() {
  return crmFetch('/api/launch-drills');
}

/** @param {string} id */
export async function fetchLaunchDrill(id) {
  return crmFetch(`/api/launch-drills/${encodeURIComponent(id)}`);
}

// --- VK Leads (CRM) ---

/** @param {{ status?: string }} [filters] */
/**
 * Сводка VK для оператора (лиды, диалоги, заказы VK на дату доставки при переданных branchId+deliveryDate).
 * @param {{ branchId?: string, deliveryDate?: string }} [params]
 */
export async function fetchVkSalesSnapshot(params = {}) {
  const q = new URLSearchParams();
  if (params.branchId) q.set('branchId', params.branchId);
  if (params.deliveryDate) q.set('deliveryDate', params.deliveryDate);
  const qs = q.toString();
  return crmFetch(`/api/vk-leads/snapshot${qs ? `?${qs}` : ''}`);
}

export async function fetchVkLeads(filters = {}) {
  const q = new URLSearchParams();
  if (filters.status) q.set('status', filters.status);
  const qs = q.toString();
  return crmFetch(`/api/vk-leads${qs ? `?${qs}` : ''}`);
}

/** @param {string} id */
export async function fetchVkLead(id) {
  return crmFetch(`/api/vk-leads/${encodeURIComponent(id)}`);
}

/** @param {string} id @param {{ status: string }} body */
export async function patchVkLead(id, body) {
  return crmFetch(`/api/vk-leads/${encodeURIComponent(id)}`, { method: 'PATCH', body });
}

/** @param {string} id */
export async function postVkLeadConvert(id) {
  return crmFetch(`/api/vk-leads/${encodeURIComponent(id)}/convert`, { method: 'POST', body: {} });
}

/** @returns {Promise<Record<string, unknown>>} расширенный объект готовности VK (см. GET /api/vk-bot/readiness) */
export async function fetchVkBotReadiness() {
  return crmFetch('/api/vk-bot/readiness');
}

export async function fetchOrderWindow(branchId, date) {
  return crmFetch();
}

export async function openOrderWindow(branchId, date) {
  return crmFetch("/api/order-window/open", { method: "POST", body: JSON.stringify({ branchId, date }) });
}

export async function closeOrderWindow(branchId, date) {
  return crmFetch("/api/order-window/close", { method: "POST", body: JSON.stringify({ branchId, date }) });
}
