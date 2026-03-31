#!/usr/bin/env node
/**
 * Публичный smoke-check цепочки: health → branches → menu-day → quote → (опц.) delivery-order.
 * Совпадает с допущениями landing-order/index.html (ответы { ok, data }).
 *
 * Env: POLDEN_SMOKE_API_BASE (по умолчанию http://localhost:4000/api)
 *      POLDEN_SMOKE_BRANCH_ID — явная точка
 *      POLDEN_SMOKE_SKIP_ORDER=1 — не создавать заказ (только quote)
 *      POLDEN_SMOKE_ATTRIBUTION=1 — добавить в POST телу объект attribution (проверка приёма на бэкенде)
 *
 * CLI: node scripts/public-order-smoke.mjs [--api-base URL] [--dry-run]
 *      --dry-run — то же, что пропуск создания заказа
 */

function broken(text) {
  const t = String(text || '');
  return !t || t.includes('\uFFFD') || /[ÐÑ]/.test(t);
}

function confirmedMenuItem(it) {
  if (!it || it.position == null) return false;
  if (broken(it.name)) return false;
  return String(it.name).trim().length > 0;
}

/** Локальный календарный завтра YYYY-MM-DD (согласовано с лендингом и seed CRM, без UTC-сдвига). */
function tomorrowISO() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function normalizeApiBase(raw) {
  let s = String(raw || '').trim().replace(/\/$/, '');
  if (!s.endsWith('/api')) s = `${s}/api`;
  return s;
}

function originFromApiBase(apiBase) {
  return apiBase.replace(/\/?api\/?$/i, '') || apiBase;
}

async function fetchJson(url, opts = {}) {
  const headers = {
    Accept: 'application/json',
    ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
    ...opts.headers
  };
  let res;
  try {
    res = await fetch(url, { ...opts, headers });
  } catch (e) {
    const hint = e?.cause?.code === 'ECONNREFUSED' ? ' (сервер не слушает порт / неверный URL)' : '';
    throw new Error(`fetch ${url}${hint}: ${e?.message || e}`);
  }
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`Non-JSON ${url}: ${text.slice(0, 240)}`);
  }
  if (!res.ok || !json?.ok) {
    const msg = json?.error?.message || json?.error?.code || res.statusText;
    throw new Error(`${url} → HTTP ${res.status}: ${msg}`);
  }
  return json.data;
}

function pickBranch(branches, explicitId) {
  if (explicitId) {
    const b = branches.find((x) => x.id === explicitId);
    if (!b) throw new Error(`POLDEN_SMOKE_BRANCH_ID not found: ${explicitId}`);
    return b;
  }
  const byCenter = branches.find((b) => /центр/i.test(String(b.name || '')));
  return byCenter || branches[0] || null;
}

/** Позиции с подтверждённым именем в ответе menu-day (как на лендинге). */
function confirmedPositions(items) {
  const set = new Set();
  for (const it of items || []) {
    if (confirmedMenuItem(it)) set.add(Number(it.position));
  }
  return set;
}

/**
 * Минимальный набор для ненулевого combo или допа: как у pricing на бэкенде.
 */
function pickSmokeItems(confirmed) {
  const g1 = [1, 2].find((p) => confirmed.has(p));
  const g2 = [3, 4].find((p) => confirmed.has(p));
  const g3 = [5, 6].find((p) => confirmed.has(p));
  if (g1 != null && g2 != null && g3 != null) {
    return [
      { position: g1, qty: 1 },
      { position: g2, qty: 1 },
      { position: g3, qty: 1 }
    ];
  }
  const extra = [7, 8, 9, 10].find((p) => confirmed.has(p));
  if (extra != null) return [{ position: extra, qty: 1 }];
  return null;
}

function assertOrderShape(order, label) {
  const errs = [];
  if (!order || typeof order !== 'object') errs.push('order not an object');
  else {
    if (typeof order.id !== 'string' || !order.id.length) errs.push('missing data.id (string)');
    if (order.deliveryDate == null && order.delivery_date == null) errs.push('missing deliveryDate');
    if (typeof order.customerName !== 'string' || !order.customerName.length) errs.push('missing customerName');
    if (typeof order.totalAmount !== 'number') errs.push('missing totalAmount (number)');
    if (!Array.isArray(order.items)) errs.push('missing items (array)');
    if (!order.branch || typeof order.branch.name !== 'string') errs.push('missing branch.name');
  }
  if (errs.length) throw new Error(`${label}: ${errs.join('; ')}`);
}

function parseArgs(argv) {
  let apiBase = normalizeApiBase(process.env.POLDEN_SMOKE_API_BASE || 'http://localhost:4000/api');
  let dryRun = process.env.POLDEN_SMOKE_SKIP_ORDER === '1' || process.env.POLDEN_SMOKE_SKIP_ORDER === 'true';
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--dry-run') dryRun = true;
    else if (argv[i] === '--api-base' && argv[i + 1]) {
      apiBase = normalizeApiBase(argv[++i]);
    }
  }
  return { apiBase, dryRun };
}

async function main() {
  const { apiBase, dryRun } = parseArgs(process.argv);
  const origin = originFromApiBase(apiBase);
  const branchIdEnv = process.env.POLDEN_SMOKE_BRANCH_ID?.trim() || '';

  const steps = [];
  const fail = (name, err) => {
    console.error(`\nFAIL: ${name}`);
    console.error(err?.message || err);
    process.exit(1);
  };

  try {
    // 1) Health
    const healthUrl = `${origin}/health`;
    const health = await fetchJson(healthUrl);
    if (health?.status !== 'healthy') throw new Error(`expected data.status === 'healthy', got ${JSON.stringify(health)}`);
    steps.push(`[PASS] GET /health → status healthy`);

    // 2) Branches
    const branches = await fetchJson(`${apiBase}/public/branches`);
    if (!Array.isArray(branches) || branches.length === 0) throw new Error('branches empty');
    const branch = pickBranch(branches, branchIdEnv);
    if (!branch?.id) throw new Error('no branch resolved');
    steps.push(`[PASS] GET /public/branches → ${branches.length} branch(es), using "${branch.name}" (${branch.id})`);

    // 3) Menu-day tomorrow
    const date = tomorrowISO();
    const menuData = await fetchJson(
      `${apiBase}/public/menu-day?branchId=${encodeURIComponent(branch.id)}&date=${encodeURIComponent(date)}`
    );
    const items = menuData?.items;
    if (!Array.isArray(items)) throw new Error('menu-day: items not an array');
    const confirmed = confirmedPositions(items);
    if (confirmed.size === 0) throw new Error('menu-day: no confirmed-live positions (empty names) — лендинг будет в degraded/illustrative');
    steps.push(`[PASS] GET /public/menu-day date=${date} → ${items.length} slots, ${confirmed.size} confirmed-live`);

    const smokeItems = pickSmokeItems(confirmed);
    if (!smokeItems) {
      throw new Error(
        'Cannot build smoke items: need either soup+main+salad groups (1–2, 3–4, 5–6) each with confirmed name, or one confirmed extra 7–10'
      );
    }
    steps.push(`[INFO] smoke items: ${JSON.stringify(smokeItems)}`);

    // 4) Quote
    const quoteBody = { branchId: branch.id, deliveryDate: date, items: smokeItems };
    const quote = await fetchJson(`${apiBase}/public/delivery-orders/quote`, {
      method: 'POST',
      body: JSON.stringify(quoteBody)
    });
    if (typeof quote?.totalAmount !== 'number') throw new Error('quote: totalAmount missing');
    steps.push(`[PASS] POST /public/delivery-orders/quote → totalAmount=${quote.totalAmount}`);

    if (dryRun) {
      steps.push(`[SKIP] POST /public/delivery-orders (--dry-run / POLDEN_SMOKE_SKIP_ORDER)`);
      console.log(steps.join('\n'));
      console.log('\nPASS (smoke without order create)\n');
      return;
    }

    // 5) Create order (один тестовый заказ)
    const payload = {
      branchId: branch.id,
      deliveryDate: date,
      customerName: 'SMOKE_TEST Полдень',
      customerPhone: '79000000000',
      address: 'smoke-test',
      comment: 'SMOKE_TEST_PUBLIC_ORDER — тест скрипта, можно удалить',
      paymentType: 'CARD',
      totalAmount: Math.max(0, Math.floor(Number(quote.totalAmount || 0))),
      items: smokeItems
    };

    if (process.env.POLDEN_SMOKE_ATTRIBUTION === '1') {
      payload.attribution = {
        utm_source: 'smoke',
        utm_medium: 'script',
        utm_campaign: 'public-order-smoke',
        landing_path: '/smoke-test'
      };
      steps.push('[INFO] attribution object attached (POLDEN_SMOKE_ATTRIBUTION=1)');
    }

    const order = await fetchJson(`${apiBase}/public/delivery-orders`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    assertOrderShape(order, 'delivery-order response');
    steps.push(`[PASS] POST /public/delivery-orders → id=${order.id}`);
    steps.push(`[PASS] response shape: id, deliveryDate, customerName, totalAmount, items[], branch.name`);

    console.log(steps.join('\n'));
    console.log('\nPASS — публичная цепочка и форма ответа для UI успеха совпадают с ожиданиями лендинга.\n');
  } catch (e) {
    console.log(steps.join('\n'));
    fail('public-order-smoke', e);
  }
}

main();
