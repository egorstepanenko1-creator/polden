/**
 * Supplier ingredient offers — активность по времени, выбор лучшего оффера для закупки.
 */

import { ingredientPriceIntervalsOverlap } from './kitchenCatalogRoutes.js';

/**
 * @param {{ effectiveFrom: Date, effectiveTo: Date | null }} offer
 * @param {Date} at
 */
export function isSupplierOfferActiveAt(offer, at) {
  if (!offer || !at) return false;
  if (offer.effectiveFrom.getTime() > at.getTime()) return false;
  if (offer.effectiveTo != null && offer.effectiveTo.getTime() <= at.getTime()) return false;
  return true;
}

/**
 * Лучший оффер: минимальная цена за единицу (коп/базовая ед.), при равенстве — более поздний effectiveFrom,
 * затем имя поставщика по ru, затем id поставщика по убыванию.
 * @param {any} a
 * @param {any} b
 * @returns {number}
 */
export function compareOffersForBestPurchase(a, b) {
  const packA = Number(a.packQuantity);
  const packB = Number(b.packQuantity);
  const cmpPrice = a.pricePerPackKopeks * packB - b.pricePerPackKopeks * packA;
  if (cmpPrice !== 0) return cmpPrice;
  const t = b.effectiveFrom.getTime() - a.effectiveFrom.getTime();
  if (t !== 0) return t;
  const nameCmp = String(a.supplier.name).localeCompare(String(b.supplier.name), 'ru');
  if (nameCmp !== 0) return nameCmp;
  return String(b.supplier.id).localeCompare(String(a.supplier.id));
}

/**
 * @param {any[]} offers — уже отфильтрованные по ингредиенту/единице и v1 defaultUnit
 * @param {Date} at
 */
export function pickBestActiveOffer(offers, at) {
  const active = offers.filter(
    (o) => o.supplier?.isActive && isSupplierOfferActiveAt(o, at) && Number(o.packQuantity) > 0
  );
  if (active.length === 0) return null;
  return [...active].sort(compareOffersForBestPurchase)[0];
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} supplierId
 * @param {string} ingredientId
 * @param {string} unitId
 * @param {Date} effectiveFrom
 * @param {Date | null} effectiveTo
 * @param {string | undefined} excludeOfferId
 */
export async function assertNoOverlappingSupplierOffers(
  prisma,
  { supplierId, ingredientId, unitId, effectiveFrom, effectiveTo, excludeOfferId }
) {
  const existing = await prisma.supplierIngredientOffer.findMany({
    where: {
      supplierId,
      ingredientId,
      unitId,
      ...(excludeOfferId ? { id: { not: excludeOfferId } } : {})
    }
  });
  for (const e of existing) {
    if (ingredientPriceIntervalsOverlap(effectiveFrom, effectiveTo, e.effectiveFrom, e.effectiveTo)) {
      const err = new Error(
        'Интервал действия пересекается с другим оффером этого поставщика для той же пары ингредиент+единица'
      );
      err.code = 'VALIDATION';
      throw err;
    }
  }
}

/**
 * Все офферы по списку ингредиентов, потенциально действующие на момент at (грубый фильтр в SQL).
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string[]} ingredientIds
 * @param {Date} at
 */
export async function loadSupplierOffersForIngredientsAt(prisma, ingredientIds, at) {
  if (ingredientIds.length === 0) return [];
  return prisma.supplierIngredientOffer.findMany({
    where: {
      ingredientId: { in: ingredientIds },
      supplier: { isActive: true },
      effectiveFrom: { lte: at },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: at } }]
    },
    include: {
      supplier: true,
      ingredient: { select: { id: true, defaultUnitId: true } },
      unit: { select: { id: true, code: true, displayName: true } }
    }
  });
}

/**
 * @param {number} purchaseNeedQty
 * @param {any} offer
 * @param {Date} at
 * @returns {null | { supplierId: string, supplierName: string, offerId: string, packQuantity: number, pricePerPackKopeks: number, pricePerBaseUnitKopeks: number, estimatedPacksNeeded: number, estimatedBuyCostKopeks: number }}
 */
export function buildSupplierOptionForPurchaseNeed(purchaseNeedQty, offer, at) {
  if (!offer || !isSupplierOfferActiveAt(offer, at) || !offer.supplier?.isActive) return null;
  const pack = Number(offer.packQuantity);
  if (!Number.isFinite(pack) || pack <= 0) return null;
  if (offer.unitId !== offer.ingredient.defaultUnitId) return null;

  const pricePerBaseUnitKopeks = offer.pricePerPackKopeks / pack;
  const estimatedPacksNeeded = Math.ceil(purchaseNeedQty / pack - 1e-12);
  const estimatedBuyCostKopeks = estimatedPacksNeeded * offer.pricePerPackKopeks;

  return {
    supplierId: offer.supplierId,
    supplierName: offer.supplier.name,
    offerId: offer.id,
    packQuantity: pack,
    pricePerPackKopeks: offer.pricePerPackKopeks,
    pricePerBaseUnitKopeks,
    estimatedPacksNeeded,
    estimatedBuyCostKopeks
  };
}

/**
 * @param {Map<string, any[]>} offersByIngredientId — офферы с include supplier, ingredient.defaultUnitId
 * @param {{ ingredientId: string, unitId: string, purchaseNeedQty: number }} row
 * @param {Date} at
 */
export function resolveBestSupplierOptionForRow(offersByIngredientId, row, at) {
  const list = offersByIngredientId.get(row.ingredientId) || [];
  const compatible = list.filter(
    (o) => o.unitId === row.unitId && o.unitId === o.ingredient.defaultUnitId
  );
  const best = pickBestActiveOffer(compatible, at);
  if (!best) return null;
  return buildSupplierOptionForPurchaseNeed(row.purchaseNeedQty, best, at);
}

/**
 * @param {any[]} offers from loadSupplierOffersForIngredientsAt
 * @returns {Map<string, any[]>}
 */
export function groupOffersByIngredientId(offers) {
  /** @type {Map<string, any[]>} */
  const m = new Map();
  for (const o of offers) {
    if (o.unitId !== o.ingredient.defaultUnitId) continue;
    const arr = m.get(o.ingredientId) || [];
    arr.push(o);
    m.set(o.ingredientId, arr);
  }
  return m;
}
