/**
 * Stock truth v1 — signed quantity from movement type; balances = Σ movements.
 */

export const STOCK_MOVEMENT_TYPES = [
  'OPENING_BALANCE',
  'RECEIPT',
  'ADJUSTMENT_IN',
  'ADJUSTMENT_OUT',
  'WASTE',
  'PRODUCTION_CONSUMPTION'
];

const POSITIVE_TYPES = new Set(['OPENING_BALANCE', 'RECEIPT', 'ADJUSTMENT_IN']);
const NEGATIVE_TYPES = new Set(['ADJUSTMENT_OUT', 'WASTE', 'PRODUCTION_CONSUMPTION']);
const ALL_TYPES = new Set(STOCK_MOVEMENT_TYPES);

/**
 * @param {string} movementType
 * @param {number} quantityPositive — strictly positive magnitude from payload/DB
 * @returns {number} signed delta for balance aggregation
 */
export function movementSignedQuantity(movementType, quantityPositive) {
  const q = Number(quantityPositive);
  if (!Number.isFinite(q) || q <= 0) {
    throw new Error('Stock movement quantity must be a finite number > 0');
  }
  if (POSITIVE_TYPES.has(movementType)) return q;
  if (NEGATIVE_TYPES.has(movementType)) return -q;
  throw new Error(`Unknown stock movementType: ${movementType}`);
}

export function isValidMovementType(t) {
  return typeof t === 'string' && ALL_TYPES.has(t);
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} branchId
 */
export async function buildStockBalancesForBranch(prisma, branchId) {
  const rows = await prisma.stockMovement.findMany({
    where: { branchId: String(branchId) },
    include: {
      ingredient: { select: { name: true } },
      unit: { select: { code: true, displayName: true } }
    },
    orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }]
  });

  /** @type {Map<string, { ingredientId: string, ingredientName: string, unitId: string, unitCode: string, unitDisplayName: string, balance: number }>} */
  const map = new Map();

  for (const r of rows) {
    const signed = movementSignedQuantity(r.movementType, Number(r.quantity));
    const key = `${r.ingredientId}\t${r.unitId}`;
    let row = map.get(key);
    if (!row) {
      row = {
        ingredientId: r.ingredientId,
        ingredientName: r.ingredient.name,
        unitId: r.unitId,
        unitCode: r.unit.code,
        unitDisplayName: r.unit.displayName,
        balance: 0
      };
      map.set(key, row);
    }
    row.balance += signed;
  }

  return [...map.values()].sort((a, b) => a.ingredientName.localeCompare(b.ingredientName, 'ru'));
}

/**
 * @param {{ movementType: string, quantity: unknown }} row
 */
export function movementResponseFields(row) {
  const mag = Number(row.quantity);
  const signedQuantity = movementSignedQuantity(row.movementType, mag);
  return { signedQuantity };
}
