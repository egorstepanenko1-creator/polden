/**
 * Proof: buildProductionStockGapPayload runs (Prisma, no HTTP).
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { buildProductionStockGapPayload } from '../src/productionStockGap.js';

const prisma = new PrismaClient();

async function main() {
  const branch = await prisma.branch.findFirst();
  if (!branch) {
    console.error('No branch — run db:seed');
    process.exit(1);
  }
  const d = new Date();
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const payload = await buildProductionStockGapPayload(prisma, branch.id, date);
  console.log('prove-production-stock-gap: OK', {
    branchId: payload.branchId,
    date: payload.date,
    rows: payload.rows.length,
    summary: payload.summary
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
