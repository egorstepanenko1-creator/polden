/**
 * Proof: generatePurchaseDraft rejects zero lines; serialization smoke.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { generatePurchaseDraft, serializePurchaseDraft } from '../src/purchaseDraftService.js';

const prisma = new PrismaClient();

async function main() {
  const branch = await prisma.branch.findFirst();
  if (!branch) {
    console.error('No branch');
    process.exit(1);
  }
  const d = new Date();
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  try {
    await generatePurchaseDraft(prisma, { branchId: branch.id, date, at: new Date() });
    console.error('Expected VALIDATION for empty snapshot');
    process.exit(1);
  } catch (e) {
    if (e.code !== 'VALIDATION') {
      console.error('Wrong error', e);
      process.exit(1);
    }
    console.log('prove-purchase-draft: zero-lines rejection OK:', e.message.slice(0, 80) + '…');
  }

  const anyDraft = await prisma.purchaseDraft.findFirst({
    include: {
      branch: { select: { id: true, name: true } },
      lines: {
        include: {
          ingredient: { select: { id: true, name: true } },
          unit: { select: { id: true, code: true, displayName: true } },
          supplier: { select: { id: true, name: true } }
        }
      }
    }
  });
  if (anyDraft) {
    const ser = serializePurchaseDraft(anyDraft);
    if (typeof ser.totalEstimatedCostKopeks !== 'number') throw new Error('total cost');
    console.log('prove-purchase-draft: serialize OK draft', anyDraft.id, 'lines', ser.lines.length);
  } else {
    console.log('prove-purchase-draft: no drafts in DB (serialize skipped)');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
