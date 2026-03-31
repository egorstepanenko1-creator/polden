/**
 * Proof: buildPurchaseNeedSnapshotPayload (Prisma, no HTTP).
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { buildPurchaseNeedSnapshotPayload } from '../src/purchaseNeedSnapshot.js';

const prisma = new PrismaClient();

async function main() {
  const branch = await prisma.branch.findFirst();
  if (!branch) {
    console.error('No branch — run db:seed');
    process.exit(1);
  }
  const d = new Date();
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const payload = await buildPurchaseNeedSnapshotPayload(prisma, branch.id, date);
  console.log('prove-purchase-need-snapshot: OK', {
    branchId: payload.branchId,
    date: payload.date,
    summary: payload.summary,
    rowCount: payload.rows.length
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
