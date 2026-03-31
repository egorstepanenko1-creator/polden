/**
 * Launch Day Proof v1 — проверка цепочки: health → content-items → content-performance.
 *
 * Запуск из каталога backend (чтобы подхватился .env):
 *   node scripts/prove-launch-day.mjs
 *   node scripts/prove-launch-day.mjs --ensure-test-item
 *   node scripts/prove-launch-day.mjs --strict-origin   # FAIL, если PUBLIC_SITE_ORIGIN не «боевой»
 *
 * Переменные: API_URL (по умолчанию http://localhost:4000), CRM_INTERNAL_TOKEN (по умолчанию dev)
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import { resolvePublicSiteOriginMeta } from '../src/contentGeneratedUrl.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const origin = process.env.API_URL || 'http://localhost:4000';
const token = process.env.CRM_INTERNAL_TOKEN || 'dev';
const ensureTestItem = process.argv.includes('--ensure-test-item');
const strictOrigin = process.argv.includes('--strict-origin');

let failed = false;
function fail(msg) {
  console.error(`FAIL: ${msg}`);
  failed = true;
}
function pass(msg) {
  console.log(`PASS: ${msg}`);
}
function warn(msg) {
  console.warn(`WARN: ${msg}`);
}

async function fetchJson(url, opts = {}) {
  const { method, body, headers: h, ...rest } = opts;
  const r = await fetch(url, {
    ...rest,
    method: method || 'GET',
    headers: {
      Accept: 'application/json',
      ...(body != null ? { 'Content-Type': 'application/json' } : {}),
      'X-CRM-Token': token,
      ...(h || {})
    },
    body: body != null ? JSON.stringify(body) : undefined
  });
  const text = await r.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { ok: r.ok, status: r.status, json, text };
}

// --- 1. Health (без токена) ---
{
  const url = `${origin}/health`;
  const r = await fetch(url, { headers: { Accept: 'application/json' } });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j?.ok || j?.data?.status !== 'healthy') {
    fail(`/health недоступен или не ok (${r.status})`);
  } else {
    pass('backend /health');
  }
}

// --- 2. Content items ---
let items = [];
{
  const { ok, status, json } = await fetchJson(`${origin}/api/content-items`);
  if (!ok || !json?.ok || !Array.isArray(json.data)) {
    fail(`/api/content-items -> ${status} ${JSON.stringify(json)}`);
  } else {
    pass('protected GET /api/content-items');
    items = json.data;
  }
}

if (!failed && items.length === 0 && ensureTestItem) {
  const suffix = Date.now().toString(36);
  const { ok, status, json } = await fetchJson(`${origin}/api/content-items`, {
    method: 'POST',
    body: {
      title: `Launch proof drill ${suffix}`,
      channel: 'VK',
      status: 'DRAFT',
      landingPath: '/menu',
      utmCampaign: 'launch-drill',
      utmContent: `proof-${suffix}`
    }
  });
  if (!ok || !json?.ok) {
    fail(`POST /api/content-items (ensure test) -> ${status} ${JSON.stringify(json)}`);
  } else {
    pass('POST /api/content-items (--ensure-test-item)');
    const list = await fetchJson(`${origin}/api/content-items`);
    if (list.ok && list.json?.ok && Array.isArray(list.json.data)) items = list.json.data;
  }
}

if (!failed && items.length === 0) {
  fail('нет ни одного content item (добавьте в CRM или запустите с --ensure-test-item)');
}

// --- 3. Content performance ---
if (!failed) {
  const { ok, status, json } = await fetchJson(`${origin}/api/content-performance`);
  if (!ok || !json?.ok || !Array.isArray(json.data)) {
    fail(`/api/content-performance -> ${status} ${JSON.stringify(json)}`);
  } else {
    pass('protected GET /api/content-performance');
    if (json.data.length === 0 && items.length > 0) {
      warn('performance вернул пустой массив при непустых items (проверьте фильтры на сервере)');
    }
  }
}

// --- 4. Drill path: первый материал ---
if (!failed && items.length > 0) {
  const sample = items[0];
  const hasUrl = Boolean(sample.generatedUrl && String(sample.generatedUrl).trim());
  if (!hasUrl) warn(`первый материал ${sample.id} без generatedUrl — проверьте сохранение`);
  else pass(`drill: есть материал id=${sample.id}, safety=${sample.generatedUrlSafety || 'n/a'}`);
}

// --- 5. Origin (локально часто missing — только WARN, кроме --strict-origin) ---
{
  const meta = resolvePublicSiteOriginMeta();
  if (strictOrigin) {
    if (meta.code !== 'ok') {
      fail(`--strict-origin: PUBLIC_SITE_ORIGIN небезопасен для публикации (code=${meta.code})`);
    } else {
      pass(`--strict-origin: PUBLIC_SITE_ORIGIN ok (${meta.effectiveOrigin})`);
    }
  } else if (meta.code !== 'ok') {
    warn(
      `PUBLIC_SITE_ORIGIN: ${meta.code} (effectiveOrigin=${meta.effectiveOrigin}) — для прод-ссылок задайте реальный origin`
    );
  } else {
    pass(`PUBLIC_SITE_ORIGIN настроен (${meta.effectiveOrigin})`);
  }
}

if (failed) {
  console.log('\nRESULT: FAIL');
  process.exit(1);
}
console.log('\nRESULT: PASS');
process.exit(0);
