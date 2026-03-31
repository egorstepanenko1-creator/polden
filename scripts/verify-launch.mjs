#!/usr/bin/env node
/**
 * Единая проверка базовой готовности к релизу: health → (KPI) → публичный smoke → сборка CRM frontend.
 *
 * CLI:
 *   node scripts/verify-launch.mjs [--api-base URL] [--dry-run] [--full]
 *   --dry-run   только health + KPI + smoke без POST заказа (по умолчанию)
 *   --full      smoke с созданием тестового заказа; опционально атрибуция (см. env)
 *
 * Env:
 *   POLDEN_VERIFY_API_BASE   база API (по умолч. http://localhost:4000/api)
 *   POLDEN_VERIFY_CRM_TOKEN заголовок X-CRM-Token (по умолч. dev, как CRM_INTERNAL_TOKEN)
 *   POLDEN_SMOKE_ATTRIBUTION=1 — в режиме --full добавить attribution в теле заказа (наследие smoke)
 */

import { spawnSync } from 'child_process';
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CRM_MVP_ROOT = join(__dirname, '..');
const REPO_ROOT = join(CRM_MVP_ROOT, '..', '..');
const SMOKE_SCRIPT = join(REPO_ROOT, 'landing-order', 'scripts', 'public-order-smoke.mjs');
const FRONTEND_DIR = join(CRM_MVP_ROOT, 'frontend');

function normalizeApiBase(raw) {
  let s = String(raw || '').trim().replace(/\/$/, '');
  if (!s.endsWith('/api')) s = `${s}/api`;
  return s;
}

function originFromApiBase(apiBase) {
  return apiBase.replace(/\/?api\/?$/i, '') || apiBase;
}

function parseArgs(argv) {
  let apiBase = normalizeApiBase(process.env.POLDEN_VERIFY_API_BASE || 'http://localhost:4000/api');
  let dryRun = true;
  let full = false;
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--dry-run') dryRun = true;
    else if (argv[i] === '--full') {
      full = true;
      dryRun = false;
    } else if (argv[i] === '--api-base' && argv[i + 1]) {
      apiBase = normalizeApiBase(argv[++i]);
    }
  }
  if (full) dryRun = false;
  return { apiBase, dryRun, full };
}

const steps = [];
let failed = false;

function logPass(name) {
  console.log(`[PASS] ${name}`);
  steps.push({ name, ok: true });
}

function logFail(name, err) {
  failed = true;
  const msg = err?.message || String(err);
  console.error(`[FAIL] ${name}`);
  console.error(`       ${msg}`);
  steps.push({ name, ok: false, error: msg });
}

async function checkHealth(apiBase) {
  const origin = originFromApiBase(apiBase);
  const url = `${origin}/health`;
  const res = await fetch(url);
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`Non-JSON from ${url}: ${text.slice(0, 200)}`);
  }
  if (!res.ok || !json?.ok || json?.data?.status !== 'healthy') {
    throw new Error(`Expected ok + data.status healthy, got HTTP ${res.status} ${JSON.stringify(json).slice(0, 300)}`);
  }
}

async function checkLaunchKpis(apiBase) {
  const token = process.env.POLDEN_VERIFY_CRM_TOKEN || process.env.CRM_INTERNAL_TOKEN || 'dev';
  const branchesUrl = `${apiBase}/public/branches`;
  const brRes = await fetch(branchesUrl, { headers: { Accept: 'application/json' } });
  const brText = await brRes.text();
  const brJson = brText ? JSON.parse(brText) : null;
  if (!brRes.ok || !brJson?.ok || !Array.isArray(brJson.data) || !brJson.data[0]?.id) {
    throw new Error(`Branches: HTTP ${brRes.status} ${String(brText).slice(0, 240)}`);
  }
  const branchId = brJson.data[0].id;
  const kpiUrl = `${apiBase}/dashboard/launch-kpis?branchId=${encodeURIComponent(branchId)}&days=1`;
  const kRes = await fetch(kpiUrl, {
    headers: { Accept: 'application/json', 'X-CRM-Token': token }
  });
  const kText = await kRes.text();
  const kJson = kText ? JSON.parse(kText) : null;
  if (!kRes.ok || !kJson?.ok || kJson?.data?.totals == null) {
    throw new Error(`launch-kpis: HTTP ${kRes.status} ${String(kText).slice(0, 240)}`);
  }
  const t = kJson.data.totals;
  if (typeof t.orderCount !== 'number' || typeof t.revenueKopeks !== 'number' || typeof t.aovKopeks !== 'number') {
    throw new Error('launch-kpis: invalid totals shape');
  }
}

function runSmoke(apiBase, dryRun) {
  if (!existsSync(SMOKE_SCRIPT)) {
    throw new Error(`Smoke script not found: ${SMOKE_SCRIPT}`);
  }
  const args = [SMOKE_SCRIPT, '--api-base', apiBase];
  if (dryRun) args.push('--dry-run');
  const env = { ...process.env };
  env.POLDEN_SMOKE_API_BASE = apiBase;
  if (dryRun) env.POLDEN_SMOKE_SKIP_ORDER = '1';
  else delete env.POLDEN_SMOKE_SKIP_ORDER;
  const r = spawnSync(process.execPath, args, {
    stdio: 'inherit',
    env,
    cwd: REPO_ROOT
  });
  if (r.status !== 0) {
    throw new Error(`smoke exited with code ${r.status ?? r.signal}`);
  }
}

function runFrontendBuild() {
  if (!existsSync(join(FRONTEND_DIR, 'package.json'))) {
    throw new Error(`Frontend not found: ${FRONTEND_DIR}`);
  }
  const r = spawnSync('npm', ['run', 'build'], {
    cwd: FRONTEND_DIR,
    stdio: 'inherit',
    shell: true,
    env: process.env
  });
  if (r.status !== 0) {
    throw new Error(`npm run build exited with code ${r.status}`);
  }
}

async function main() {
  const { apiBase, dryRun, full } = parseArgs(process.argv);
  console.log('');
  console.log('=== Polden launch verification ===');
  console.log(`API base: ${apiBase}`);
  console.log(`Mode: ${dryRun ? 'dry-run (no test order POST)' : 'full (creates one test order)'}`);
  console.log('');

  try {
    await checkHealth(apiBase);
    logPass('Backend /health (envelope: ok + data.status healthy)');
  } catch (e) {
    logFail('GET /health', e);
  }

  try {
    await checkLaunchKpis(apiBase);
    logPass('GET /api/dashboard/launch-kpis (X-CRM-Token + branchId from /public/branches)');
  } catch (e) {
    logFail('Protected launch-kpis', e);
  }

  try {
    runSmoke(apiBase, dryRun);
    logPass(dryRun ? 'Public smoke (dry-run: quote only)' : 'Public smoke (full: includes POST delivery-order)');
  } catch (e) {
    logFail('Public smoke-check', e);
  }

  try {
    runFrontendBuild();
    logPass('CRM frontend: npm run build');
  } catch (e) {
    logFail('CRM frontend build', e);
  }

  console.log('');
  if (failed) {
    console.log('RESULT: FAIL');
    process.exit(1);
  }
  console.log('RESULT: PASS');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
