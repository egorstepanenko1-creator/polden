/**
 * Post-deploy smoke: /health, public menu-day, CRM readiness.
 * Env: SMOKE_BASE_URL (default http://127.0.0.1:4000), SMOKE_CRM_TOKEN (fallback CRM_INTERNAL_TOKEN, else "dev").
 */

import { serverLocalTomorrowISO } from '../src/vkOrderDates.js';

const base = (process.env.SMOKE_BASE_URL || 'http://127.0.0.1:4000').replace(/\/$/, '');
const crmToken = (process.env.SMOKE_CRM_TOKEN || process.env.CRM_INTERNAL_TOKEN || 'dev').trim();

async function mustOk(res, label) {
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`${label}: non-JSON response status=${res.status} body=${text.slice(0, 200)}`);
  }
  if (!res.ok) {
    throw new Error(`${label}: HTTP ${res.status} ${JSON.stringify(body)}`);
  }
  if (!body || body.ok !== true) {
    throw new Error(`${label}: expected { ok: true } got ${JSON.stringify(body)}`);
  }
  return body.data;
}

async function main() {
  const health = await fetch(`${base}/health`);
  const healthData = await mustOk(health, 'GET /health');
  if (healthData.alive !== true || healthData.status !== 'healthy') {
    throw new Error(`GET /health: expected alive=true and status=healthy, got ${JSON.stringify(healthData)}`);
  }

  const br = await fetch(`${base}/api/public/branches`);
  const branches = await mustOk(br, 'GET /api/public/branches');
  const branchId = branches[0]?.id;
  if (!branchId) {
    throw new Error('Smoke: no Branch in DB — cannot call menu-day (seed or migrate)');
  }

  const date = serverLocalTomorrowISO();
  const menuUrl = `${base}/api/public/menu-day?branchId=${encodeURIComponent(branchId)}&date=${encodeURIComponent(date)}`;
  const menu = await fetch(menuUrl);
  await mustOk(menu, 'GET /api/public/menu-day');

  const ready = await fetch(`${base}/api/vk-bot/readiness`, {
    headers: { 'X-CRM-Token': crmToken }
  });
  const readyData = await mustOk(ready, 'GET /api/vk-bot/readiness');
  if (!readyData.operationalSafety) {
    throw new Error('GET /api/vk-bot/readiness: missing operationalSafety block');
  }

  console.log('[smoke] OK', {
    base,
    health: { alive: healthData.alive, status: healthData.status, ts: healthData.ts },
    menuDay: { branchId, date },
    operationalSafety: readyData.operationalSafety
  });
}

main().catch((e) => {
  console.error('[smoke] FAIL', e.message || e);
  process.exit(1);
});
