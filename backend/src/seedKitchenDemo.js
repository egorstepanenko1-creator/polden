/**
 * Idempotent demo data for kitchen economics proof (units, ingredients, prices, dish + published version).
 * Safe to run multiple times.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEMO_DISH_NAME = 'Kitchen demo pilaf';

async function main() {
  const existing = await prisma.dish.findFirst({ where: { name: DEMO_DISH_NAME } });
  if (existing) {
    console.log('Kitchen demo seed skip: dish already exists', existing.id);
    return;
  }

  const unitG = await prisma.unit.create({
    data: { code: 'g', displayName: 'Gram' }
  });
  const unitMl = await prisma.unit.create({
    data: { code: 'ml', displayName: 'Millilitre' }
  });

  const rice = await prisma.ingredient.create({
    data: { name: 'Rice (demo)', defaultUnitId: unitG.id, active: true }
  });
  const oil = await prisma.ingredient.create({
    data: { name: 'Oil (demo)', defaultUnitId: unitMl.id, active: true }
  });

  const epoch = new Date('2020-01-01T00:00:00.000Z');

  await prisma.ingredientPrice.create({
    data: {
      ingredientId: rice.id,
      unitId: unitG.id,
      pricePerUnitKopeks: 1_20,
      effectiveFrom: epoch,
      effectiveTo: null
    }
  });
  await prisma.ingredientPrice.create({
    data: {
      ingredientId: oil.id,
      unitId: unitMl.id,
      pricePerUnitKopeks: 90,
      effectiveFrom: epoch,
      effectiveTo: null
    }
  });

  const dish = await prisma.dish.create({
    data: { name: DEMO_DISH_NAME, active: true, category: 'demo' }
  });

  const dv = await prisma.dishVersion.create({
    data: {
      dishId: dish.id,
      versionNumber: 1,
      status: 'published',
      notes: 'Demo recipe v1'
    }
  });

  await prisma.dishIngredient.createMany({
    data: [
      { dishVersionId: dv.id, ingredientId: rice.id, quantity: 200, unitId: unitG.id },
      { dishVersionId: dv.id, ingredientId: oil.id, quantity: 10, unitId: unitMl.id }
    ]
  });

  console.log('Kitchen demo seeded. DishVersion id for tests:', dv.id);
  console.log('Expected food cost (kopeks): rice 200*120=24000, oil 10*90=900 → total 24900');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
