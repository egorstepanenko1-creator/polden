/**
 * Proof: supplier offer comparison + optional Prisma models.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { compareOffersForBestPurchase, pickBestActiveOffer } from '../src/supplierOffers.js';

const at = new Date('2026-06-15T12:00:00.000Z');
const offerA = {
  supplierId: 's2',
  supplier: { id: 's2', name: 'Поставщик B', isActive: true },
  ingredientId: 'ing1',
  ingredient: { id: 'ing1', defaultUnitId: 'u1' },
  unitId: 'u1',
  packQuantity: 2,
  pricePerPackKopeks: 100,
  effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
  effectiveTo: null
};
const offerB = {
  supplierId: 's1',
  supplier: { id: 's1', name: 'Поставщик A', isActive: true },
  ingredientId: 'ing1',
  ingredient: { id: 'ing1', defaultUnitId: 'u1' },
  unitId: 'u1',
  packQuantity: 4,
  pricePerPackKopeks: 200,
  effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
  effectiveTo: null
};
// same price per base unit 50; tie-break name ru → A before B
const sorted = [offerA, offerB].sort(compareOffersForBestPurchase);
if (sorted[0].supplier.name !== 'Поставщик A') {
  console.error('tie-break name failed', sorted[0]);
  process.exit(1);
}
const best = pickBestActiveOffer([offerA, offerB], at);
if (best.supplierId !== 's1') {
  console.error('pickBest failed', best);
  process.exit(1);
}

const prisma = new PrismaClient();
try {
  if (typeof prisma.supplier?.findMany !== 'function') {
    console.log('prove-supplier-foundation: logic OK (Prisma client без Supplier — выполните prisma generate)');
    process.exit(0);
  }
  const n = await prisma.supplier.count();
  console.log('prove-supplier-foundation: OK', { tieBreakSupplier: best.supplier.name, supplierRows: n });
} catch (e) {
  console.log('prove-supplier-foundation: logic OK; Prisma:', e.message);
} finally {
  await prisma.$disconnect();
}
