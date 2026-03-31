#!/usr/bin/env node
/**
 * CLI proof for foodCostKopeks (requires migrated DB + optional seedKitchenDemo).
 * Usage (from backend/): node scripts/test-food-cost.mjs [dishVersionId] [atISO]
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { foodCostBreakdownKopeks, foodCostKopeks } from '../src/foodCost.js';

const prisma = new PrismaClient();

async function main() {
  let versionId = process.argv[2];
  const atIso = process.argv[3] || new Date().toISOString();
  const at = new Date(atIso);

  if (!versionId) {
    const v = await prisma.dishVersion.findFirst({
      where: { dish: { name: 'Kitchen demo pilaf' } },
      orderBy: { versionNumber: 'desc' }
    });
    if (!v) {
      console.error('No dishVersionId arg and no "Kitchen demo pilaf" in DB. Run: npm run db:seed:kitchen');
      process.exit(1);
    }
    versionId = v.id;
  }

  const total = await foodCostKopeks(prisma, versionId, at);
  const breakdown = await foodCostBreakdownKopeks(prisma, versionId, at);

  console.log(JSON.stringify({ dishVersionId: versionId, at: at.toISOString(), totalKopeks: total, lines: breakdown.lines }, null, 2));
  process.exit(0);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
}).finally(() => prisma.$disconnect());
