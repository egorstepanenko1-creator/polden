#!/usr/bin/env node
/**
 * Proof: protected GET menu-day-items + PUT upsert with dishVersionId (needs running API + migrated DB + kitchen demo seed).
 * Env: API_ORIGIN (default http://localhost:4000), X-CRM-Token via CRM_INTERNAL_TOKEN or POLDEN_VERIFY_CRM_TOKEN (default dev)
 */
import 'dotenv/config';

const origin = (process.env.API_ORIGIN || 'http://localhost:4000').replace(/\/$/, '');
const token = process.env.POLDEN_VERIFY_CRM_TOKEN || process.env.CRM_INTERNAL_TOKEN || 'dev';

async function j(url, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-CRM-Token': token,
      ...opts.headers
    }
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`Non-JSON ${url}: ${text.slice(0, 200)}`);
  }
  if (!res.ok || !json?.ok) {
    throw new Error(`${url} → ${res.status} ${json?.error?.message || text.slice(0, 200)}`);
  }
  return json.data;
}

async function main() {
  const branches = await j(`${origin}/api/public/branches`);
  const branchId = branches[0]?.id;
  if (!branchId) throw new Error('No branches');

  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();
  const dv = await prisma.dishVersion.findFirst({
    where: { dish: { name: 'Kitchen demo pilaf' }, status: 'published' },
    orderBy: { versionNumber: 'desc' }
  });
  await prisma.$disconnect();
  if (!dv) {
    console.error('Run npm run db:seed:kitchen first.');
    process.exit(1);
  }

  const items = await j(`${origin}/api/menu-day-items?branchId=${encodeURIComponent(branchId)}&date=2099-01-01`);
  const target = Array.isArray(items) && items[0];
  const date = target?.date || '2099-01-01';
  const position = target?.position ?? 1;

  const updated = await j(`${origin}/api/menu-day-items/upsert`, {
    method: 'PUT',
    body: JSON.stringify({
      branchId,
      date,
      position,
      name: target?.name || 'Proof row',
      price: target?.price ?? 330_00,
      dishVersionId: dv.id
    })
  });

  if (updated.foodCostKopeksSnapshot !== 24900) {
    console.error('Unexpected snapshot', updated);
    process.exit(1);
  }
  if (!updated.dishVersionId || !updated.foodCostSnapshottedAt) {
    console.error('Missing economics fields', updated);
    process.exit(1);
  }

  const publicMenu = await fetch(
    `${origin}/api/public/menu-day?branchId=${encodeURIComponent(branchId)}&date=${encodeURIComponent(date)}`
  ).then((r) => r.json());
  const pub = publicMenu?.data?.items?.[0];
  if (pub && ('dishVersionId' in pub || 'foodCostKopeksSnapshot' in pub)) {
    console.error('Public menu must not expose economics keys');
    process.exit(1);
  }

  console.log('PASS menu-day economics proof:', JSON.stringify(updated, null, 2));
  process.exit(0);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
