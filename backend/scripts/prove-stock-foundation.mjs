/**
 * Proof: StockMovement journal + buildStockBalancesForBranch (no HTTP).
 * Requires: migrated DB, optional seed branch + kitchen seed for ingredient.
 */
import 'dotenv/config';
import { PrismaClient, Prisma } from '@prisma/client';
import { buildStockBalancesForBranch, movementSignedQuantity } from '../src/stockMovement.js';

const prisma = new PrismaClient();
const NOTE = 'prove-stock-foundation';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  assert(movementSignedQuantity('OPENING_BALANCE', 10) === 10, 'OPENING sign');
  assert(movementSignedQuantity('WASTE', 3) === -3, 'WASTE sign');
  assert(movementSignedQuantity('PRODUCTION_CONSUMPTION', 7) === -7, 'PRODUCTION_CONSUMPTION sign');

  const branch = await prisma.branch.findFirst();
  assert(branch, 'Need at least one Branch (run db:seed)');

  let unit = await prisma.unit.findFirst();
  let ing = await prisma.ingredient.findFirst({ include: { defaultUnit: true } });
  if (!unit || !ing) {
    unit = await prisma.unit.create({
      data: { code: `stk-${Date.now().toString(36)}`, displayName: 'Stock proof unit' }
    });
    ing = await prisma.ingredient.create({
      data: { name: 'Stock proof ingredient', defaultUnitId: unit.id },
      include: { defaultUnit: true }
    });
  }

  const uid = ing.defaultUnitId;
  await prisma.stockMovement.deleteMany({
    where: { branchId: branch.id, ingredientId: ing.id, note: NOTE }
  });

  const at = new Date('2026-03-30T10:00:00.000Z');
  const rows = [
    { movementType: 'OPENING_BALANCE', quantity: 10 },
    { movementType: 'RECEIPT', quantity: 5 },
    { movementType: 'WASTE', quantity: 2 },
    { movementType: 'ADJUSTMENT_OUT', quantity: 3 }
  ];

  for (const r of rows) {
    await prisma.stockMovement.create({
      data: {
        branchId: branch.id,
        ingredientId: ing.id,
        unitId: uid,
        movementType: r.movementType,
        quantity: new Prisma.Decimal(String(r.quantity)),
        occurredAt: at,
        note: NOTE
      }
    });
  }

  const balances = await buildStockBalancesForBranch(prisma, branch.id);
  const row = balances.find((b) => b.ingredientId === ing.id);
  assert(row, 'balance row for ingredient');
  assert(row.balance === 10, `expected balance 10 (10+5-2-3), got ${row.balance}`);

  console.log('prove-stock-foundation: OK', {
    branchId: branch.id,
    ingredientId: ing.id,
    balance: row.balance
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
