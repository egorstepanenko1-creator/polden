/**
 * Единое правило доставки для quote / создания заказа / VK / публичный сайт.
 * Порог и сумма — в копейках.
 */

export const FREE_DELIVERY_THRESHOLD_KOPEKS = 400 * 100;
export const DELIVERY_FEE_BELOW_THRESHOLD_KOPEKS = 50 * 100;

/** Короткая строка для UI (бот, лендинг, CRM). */
export const DELIVERY_RULE_SHORT_RU =
  'Бесплатная доставка от 400 ₽. Ниже 400 ₽ — доставка 50 ₽.';

/**
 * @param {number} itemsSubtotalKopeks сумма позиций меню без доставки
 * @returns {number} копейки доставки (0 или 50 ₽)
 */
export function deliveryFeeKopeksFromSubtotal(itemsSubtotalKopeks) {
  const s = Math.max(0, Math.floor(Number(itemsSubtotalKopeks) || 0));
  if (s === 0) return 0;
  return s < FREE_DELIVERY_THRESHOLD_KOPEKS ? DELIVERY_FEE_BELOW_THRESHOLD_KOPEKS : 0;
}
