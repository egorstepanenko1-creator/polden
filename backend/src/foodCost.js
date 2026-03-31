/**
 * Kitchen economics — food cost from DishVersion lines + IngredientPrice rows valid at `at`.
 *
 * Spec mapping: IngredientPrice uses effectiveFrom / effectiveTo (spec "validFrom/validTo").
 *
 * v1 assumptions:
 * - `DishIngredient.quantity` is a decimal amount in `unitId` (Prisma Decimal).
 * - `IngredientPrice.pricePerUnitKopeks` is kopeks for **one** unit of `unitId`.
 * - Line `unitId` must equal `Ingredient.defaultUnitId` (no unit conversion in v1).
 * - Price row matches if: effectiveFrom <= at AND (effectiveTo IS NULL OR effectiveTo > at).
 * - If multiple rows match, pick **latest effectiveFrom**, tie-break by **id desc** (deterministic).
 * - Missing price → throws Error (no silent fallback).
 * - Line cost: Math.round(Number(quantity) * pricePerUnitKopeks), then sum lines (per spec: round per line).
 */

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {{ ingredientId: string, unitId: string, at: Date }} args
 */
async function resolveIngredientPriceRow(prisma, { ingredientId, unitId, at }) {
  const rows = await prisma.ingredientPrice.findMany({
    where: {
      ingredientId,
      unitId,
      effectiveFrom: { lte: at },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: at } }]
    },
    orderBy: [{ effectiveFrom: 'desc' }, { id: 'desc' }],
    take: 1
  });
  if (!rows.length) {
    throw new Error(
      `Missing IngredientPrice: ingredientId=${ingredientId} unitId=${unitId} at=${at.toISOString()}`
    );
  }
  return rows[0];
}

/**
 * Full breakdown + total food cost in kopeks for a dish version at time `at`.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} dishVersionId
 * @param {Date} at
 * @returns {Promise<{ totalKopeks: number, lines: Array<{ ingredientId: string, ingredientName: string, quantity: string, unitCode: string, pricePerUnitKopeks: number, lineKopeks: number }> }>}
 */
export async function foodCostBreakdownKopeks(prisma, dishVersionId, at) {
  if (!(at instanceof Date) || Number.isNaN(at.getTime())) {
    throw new Error('foodCost: `at` must be a valid Date');
  }

  const version = await prisma.dishVersion.findUnique({
    where: { id: dishVersionId },
    include: {
      lines: {
        include: {
          ingredient: { include: { defaultUnit: true } },
          unit: true
        }
      }
    }
  });

  if (!version) {
    throw new Error(`DishVersion not found: ${dishVersionId}`);
  }

  const linesOut = [];
  let totalKopeks = 0;

  for (const line of version.lines) {
    const ing = line.ingredient;
    if (line.unitId !== ing.defaultUnitId) {
      throw new Error(
        `DishIngredient unit mismatch: ingredient "${ing.name}" (${ing.id}) line.unitId=${line.unitId} !== defaultUnitId=${ing.defaultUnitId} (v1 requires same unit as ingredient default)`
      );
    }

    const priceRow = await resolveIngredientPriceRow(prisma, {
      ingredientId: line.ingredientId,
      unitId: line.unitId,
      at
    });

    const q = Number(line.quantity);
    if (!Number.isFinite(q)) {
      throw new Error(`Invalid quantity on DishIngredient ${line.id}`);
    }

    const lineKopeks = Math.round(q * priceRow.pricePerUnitKopeks);
    totalKopeks += lineKopeks;

    linesOut.push({
      ingredientId: ing.id,
      ingredientName: ing.name,
      quantity: String(line.quantity),
      unitCode: line.unit.code,
      pricePerUnitKopeks: priceRow.pricePerUnitKopeks,
      lineKopeks
    });
  }

  return { totalKopeks, lines: linesOut };
}

/**
 * Total food cost in kopeks (sum of rounded line kopeks).
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} dishVersionId
 * @param {Date} at
 * @returns {Promise<number>}
 */
export async function foodCostKopeks(prisma, dishVersionId, at) {
  const { totalKopeks } = await foodCostBreakdownKopeks(prisma, dishVersionId, at);
  return totalKopeks;
}
