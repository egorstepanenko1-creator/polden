/**
 * Группы для выбора опубликованного рецепта в редакторе «Меню на день».
 * Соотносится с полем Dish.category в CRM и набором ttk_obedy_75_blyud_ru (Суп/Горячее/Салат/Гарнир).
 */

export const MENU_DISH_GROUP_ORDER = [
  'soup',
  'hot',
  'salad',
  'porridge',
  'extra',
  'drink',
  'bakery',
  'other'
];

export const MENU_DISH_GROUP_LABEL_RU = {
  soup: 'Супы',
  hot: 'Горячие',
  salad: 'Салаты',
  porridge: 'Каши и крупы',
  extra: 'Гарниры и дополнения',
  drink: 'Напитки',
  bakery: 'Выпечка',
  other: 'Прочее'
};

/**
 * @param {{ name?: string, category?: string | null }} dish — запись Dish из kitchen API
 * @returns {keyof MENU_DISH_GROUP_LABEL_RU}
 */
export function dishCategoryGroupKey(dish) {
  const c = String(dish?.category || '').trim();
  const n = String(dish?.name || '').toLowerCase();
  if (c === 'Суп') return 'soup';
  if (c === 'Горячее') return 'hot';
  if (c === 'Салат') return 'salad';
  if (c === 'Напиток') return 'drink';
  if (c === 'Выпечка') return 'bakery';
  if (c === 'Гарнир') {
    if (/каша|каши|пшено|гречк|круп|рис |рисовая|перлов|ячнев|пшеничн|овсян|кускус|булгур|чечевиц|горохов|пюре/.test(n)) {
      return 'porridge';
    }
    return 'extra';
  }
  if (/компот|морс|квас|чай|кофе|напиток|сок/.test(n)) return 'drink';
  if (/пирож|булк|хлеб|ватруш|слоен/.test(n)) return 'bakery';
  return 'other';
}

/**
 * @param {Array<{ sortGroup: string, label: string, id: string }>} options
 * @returns {Array<{ group: string, labelRu: string, items: typeof options }>}
 */
export function groupPublishedDishOptions(options) {
  /** @type {Map<string, typeof options>} */
  const m = new Map();
  for (const g of MENU_DISH_GROUP_ORDER) m.set(g, []);
  for (const o of options) {
    const g = MENU_DISH_GROUP_ORDER.includes(o.sortGroup) ? o.sortGroup : 'other';
    m.get(g).push(o);
  }
  return MENU_DISH_GROUP_ORDER.filter((g) => (m.get(g) || []).length > 0).map((g) => ({
    group: g,
    labelRu: MENU_DISH_GROUP_LABEL_RU[g] || g,
    items: m.get(g)
  }));
}

/**
 * Фиксированное соответствие слота меню и групп блюд (sortGroup из dishCategoryGroupKey).
 * Позиции 10+ — без ограничения (null).
 * @param {number} position
 * @returns {Set<string> | null} null = все категории
 */
export function allowedSortGroupsForMenuSlot(position) {
  const p = Number(position);
  if (!Number.isInteger(p) || p < 1) return null;
  if (p <= 2) return new Set(['soup']);
  if (p <= 4) return new Set(['hot']);
  if (p <= 6) return new Set(['salad']);
  if (p === 7) return new Set(['drink']);
  if (p === 8) return new Set(['porridge', 'extra']);
  if (p === 9) return new Set(['bakery']);
  if (p >= 10) return null;
  return null;
}

/** Подпись слота для оператора. */
export function menuSlotRoleLabelRu(position) {
  const p = Number(position);
  if (!Number.isInteger(p) || p < 1) return 'Слот';
  if (p <= 2) return 'Суп (1–2)';
  if (p <= 4) return 'Горячее (3–4)';
  if (p <= 6) return 'Салат (5–6)';
  if (p === 7) return 'Напиток (7)';
  if (p === 8) return 'Каша / гарнир (8)';
  if (p === 9) return 'Выпечка (9)';
  return `Слот ${p} (любая категория)`;
}

/**
 * @param {Array<{ sortGroup: string, id: string }>} options
 * @param {number} position
 */
export function filterPublishedOptionsBySlot(options, position) {
  const allowed = allowedSortGroupsForMenuSlot(position);
  if (allowed == null) return options;
  return options.filter((o) => allowed.has(o.sortGroup));
}
