/** Состояния структурированного заказа VK (Prisma VkConversationState.currentState). */

export const ORDER_STATES = {
  PICK_BRANCH: 'ORDER_PICK_BRANCH',
  /** Свободный ввод позиций (fallback / «назад» из проверки). */
  AWAIT_ITEMS: 'ORDER_AWAIT_ITEMS',
  REVIEW: 'ORDER_REVIEW',
  C_NAME: 'ORDER_C_NAME',
  C_PHONE: 'ORDER_C_PHONE',
  C_ADDR: 'ORDER_C_ADDR',
  C_COMMENT: 'ORDER_C_COMMENT',
  G_SOUP: 'ORDER_G_SOUP',
  G_SOUP_MORE: 'ORDER_G_SOUP_MORE',
  G_HOT: 'ORDER_G_HOT',
  G_HOT_MORE: 'ORDER_G_HOT_MORE',
  G_SALAD: 'ORDER_G_SALAD',
  G_SALAD_MORE: 'ORDER_G_SALAD_MORE',
  G_EXTRAS: 'ORDER_G_EXTRAS'
};

const ALL = new Set(Object.values(ORDER_STATES));

export function isStructuredOrderState(s) {
  return ALL.has(String(s || ''));
}

export const VK_GUIDE_STATES = new Set([
  ORDER_STATES.G_SOUP,
  ORDER_STATES.G_SOUP_MORE,
  ORDER_STATES.G_HOT,
  ORDER_STATES.G_HOT_MORE,
  ORDER_STATES.G_SALAD,
  ORDER_STATES.G_SALAD_MORE,
  ORDER_STATES.G_EXTRAS
]);
