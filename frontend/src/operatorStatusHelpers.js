/**
 * Согласовано с backend/src/deliveryOrderService.js (переходы статусов).
 */

/** @param {string} status */
export function getAllowedNextStatuses(status) {
  const s = String(status || 'NEW').trim();
  const map = {
    NEW: ['CONFIRMED', 'CANCELED'],
    CONFIRMED: ['KITCHEN', 'CANCELED'],
    KITCHEN: ['DELIVERING', 'CANCELED'],
    DELIVERING: ['DONE', 'CANCELED'],
    DONE: [],
    CANCELED: []
  };
  return map[s] || [];
}

/** Следующий шаг «вперёд» по линейной цепочке (без отмены). */
export function getLinearNextStatus(status) {
  const chain = ['NEW', 'CONFIRMED', 'KITCHEN', 'DELIVERING', 'DONE'];
  const s = String(status || 'NEW').trim();
  const i = chain.indexOf(s);
  if (i < 0 || i >= chain.length - 1) return null;
  return chain[i + 1];
}
