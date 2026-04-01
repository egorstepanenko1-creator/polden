/**
 * Тексты VK-бота (RU): коротко, прямой заказ в приоритете, CRM — источник меню.
 */

import { DELIVERY_RULE_SHORT_RU } from '../deliveryFeePolicy.js';

export { DELIVERY_RULE_SHORT_RU };

export const VK_BOT_DEFAULT_OPERATOR_HINT =
  'Напишите сюда или позвоните — подскажем по меню и доставке. Кнопка «Меню» — состав и цены на завтра из CRM.';

export const MSG_LEAD_CANCELLED = 'Ок, прервали. Выберите действие кнопками ниже.';

export const MSG_MENU_FOOTER =
  'Оформить заказ — на завтра, те же позиции и цены, что в меню выше.\nСвязаться с оператором — вопрос или помощь.\nОставить заявку — оператор свяжется и оформит при необходимости.';

export const MSG_MENU_NO_BRANCH = 'Точки доставки в CRM не настроены. Напишите оператору или оставьте заявку.';

/** Несколько филиалов без POLDEN_VK_DEFAULT_BRANCH_ID / POLDEN_VK_ORDER_PROBE_BRANCH_ID */
export const MSG_MENU_MULTI_BRANCH_HINT =
  'Несколько точек доставки: сначала нажмите «Оформить заказ» и выберите номер точки — там же увидите меню на завтра.\n\nЧтобы «Меню» открывалось сразу, задайте в .env бэкенда POLDEN_VK_DEFAULT_BRANCH_ID или POLDEN_VK_ORDER_PROBE_BRANCH_ID (id точки из CRM).';

/** @param {string} branchName @param {string} date */
export function MSG_MENU_EMPTY_CRM(branchName, date) {
  return `Точка: ${branchName}\nДата: ${date} (завтра)\n\nПозиции в CRM на этот день ещё не заполнены. Добавьте их в разделе «Меню на день».`;
}

/** @param {string} branchName @param {string} date @param {string} listBlock */
export function MSG_MENU_CRM_PRIMARY(branchName, date, listBlock) {
  return `Меню на завтра (из CRM)\n${branchName} · ${date}\n\n${listBlock}\n\nОформить заказ — кнопка ниже, состав и цены совпадают с этим списком.`;
}

export const MSG_MENU_OPTIONAL_CONTENT_SEPARATOR = '── Дополнительно (контент-пайплайн) ──';

export const MSG_VK_MENU_TRUNC_HINT = 'Продолжение по ссылке ниже или у оператора.';

/** Перед текстом MENU_DAILY при опциональном приложении */
export const MSG_VK_MENU_CONTEXT_LINE = 'Материал из контент-пайплайна (не заменяет меню CRM выше):';

export const MSG_MENU_EMPTY =
  'Меню на завтра в CRM не заполнено. Заполните «Меню на день» в CRM на нужную точку и дату.';

export const MSG_ASK_NAME = 'Как вас зовут? (или «Отмена»)';

export const MSG_NAME_TOO_SHORT = 'Имя не короче 2 символов или «Отмена».';

export const MSG_ASK_PHONE = 'Телефон, например +7 900 000-00-00:';

export const MSG_PHONE_INVALID =
  'Нужен номер РФ: 11 цифр, с 7. Или «Отмена».';

export const MSG_ASK_ADDRESS = 'Адрес доставки:';

export const MSG_ADDRESS_TOO_SHORT = 'Адрес не короче 3 символов или «Отмена».';

export const MSG_ASK_DELIVERY_DATE = 'Желаемая дата доставки (как вам удобно текстом):';

export const MSG_DATE_EMPTY = 'Укажите дату или «Отмена».';

export const MSG_ASK_COMMENT = 'Комментарий к заявке («-» если не нужен):';

export const MSG_LEAD_ACCEPTED =
  'Заявку приняли. Оператор свяжется и уточнит детали.\n\nЕсли хотите сразу заказ на завтра по меню CRM — нажмите «Оформить заказ».';

export const MSG_IDLE_CHOOSE =
  'Оформить заказ — на завтра по меню из CRM.\nМеню — цены и позиции на завтра.\nСвязаться с оператором — помощь.\nОставить заявку — оформит оператор.';

export const MSG_ORDER_NO_BRANCHES = 'Точки доставки не настроены — заказ из бота недоступен.';

export const MSG_ORDER_FALLBACK_LEAD =
  'Оставьте заявку кнопкой «Оставить заявку» — оператор оформит и перезвонит.';

export const MSG_ORDER_MENU_EMPTY =
  'На завтра в CRM нет позиций с названием — прямой заказ из бота сейчас недоступен.';

/** @param {string} branchName @param {string} date */
export function MSG_ORDER_INTRO_SINGLE_BRANCH(branchName, date) {
  return `Заказ на ${date} (завтра), точка «${branchName}». Ниже — то же меню, что в CRM.`;
}

/** @param {string} list @param {string} date */
export function MSG_ORDER_PICK_BRANCH(list, date) {
  return `Заказ на ${date} (завтра). Выберите точку номером:\n${list}`;
}

export const MSG_ORDER_BRANCH_HINT = 'Ответьте одной цифрой или «Отмена».';

/** @param {number} max */
export function MSG_ORDER_BRANCH_INVALID(max) {
  return `Нужен номер от 1 до ${max}. Или «Отмена».`;
}

/** @param {string} name @param {string} date */
export function MSG_ORDER_BRANCH_PICKED(name, date) {
  return `Точка: «${name}», дата: ${date}.`;
}

export const MSG_ORDER_ITEMS_HINT =
  'Позиции одной строкой, например:\n1x2 — две порции позиции 1\n1 2, 3 1 — то же через пробел или запятую\nПозиции 1–10, количество 1–99.\n«Сброс» — очистить корзину.\n\n' +
  DELIVERY_RULE_SHORT_RU;

/** Старт пошагового сценария (после выбора точки). */
export function MSG_ORDER_GUIDE_INTRO(date) {
  return (
    `Соберём заказ по шагам (меню на ${date}).\n` +
    `${DELIVERY_RULE_SHORT_RU}\n\n` +
    'На каждом шаге можно ответить цифрой или написать корзину одной строкой (например 1x1, 3x1) — сразу откроется проверка заказа.'
  );
}

/**
 * @param {string} title категория
 * @param {Array<{ position: number, name: string }>} slots
 */
export function MSG_ORDER_GUIDE_CATEGORY_PICK(title, slots) {
  const lines = slots.map((r, i) => `${i + 1} — ${String(r.name).trim()}`).join('\n');
  const maxDigit = slots.length;
  return (
    `«${title}» — выберите вариант:\n${lines}\n0 — пропустить раздел\n\n` +
    `Ответьте цифрой 0…${maxDigit}.`
  );
}

/** После выбора блюда в категории. */
export function MSG_ORDER_GUIDE_AFTER_PICK(title) {
  return (
    `Добавлено в корзину (${title}).\n\n` +
    '«Добавить ещё» — взять ещё одно блюдо из этого раздела.\n' +
    '«Дальше» — перейти к следующему разделу.'
  );
}

export function MSG_ORDER_GUIDE_MORE_UNCLEAR(title) {
  return `Напишите «Добавить ещё» или «Дальше» (раздел «${title}»).`;
}

/** @param {number} maxChoice 1 или 2 */
export function MSG_ORDER_GUIDE_PICK_INVALID(maxChoice) {
  return `Ответьте цифрой от 0 до ${maxChoice} или напишите корзину текстом (см. подсказку выше).`;
}

/**
 * @param {Array<{ position: number, name: string }>} extras
 */
export function MSG_ORDER_GUIDE_EXTRAS(extras) {
  const block = extras
    .map((r) => `${r.position}. ${String(r.name).trim()}`)
    .join('\n');
  return (
    `Дополнительно (по желанию):\n${block}\n\n` +
    'Напишите позиции и количество, например: 7x1, 8x2\n' +
    'Или «Пропустить» — перейти к проверке заказа без допов.\n\n' +
    DELIVERY_RULE_SHORT_RU
  );
}

export const MSG_ORDER_GUIDE_EXTRAS_RETRY =
  'Проверьте номера позиций и количество. Пример: 7x1, 9x2. Или «Пропустить».';

export const MSG_ORDER_GUIDE_EXTRAS_INVALID =
  'Не разобрал. Укажите допы как 7x1, 8x2 или напишите «Пропустить».';

export const MSG_ORDER_GUIDE_EMPTY_CART =
  'В корзине пока нет позиций. Выберите блюда по шагам или напишите корзину текстом.';

export const MSG_ORDER_GUIDE_FALLBACK_HINT =
  'Можно продолжить по шагам (ответ цифрой) или исправить строку позиций.';

/**
 * @param {string} linesBlock строки «• Название × n»
 * @param {{ sub: string, fee: string, total: string }} p
 */
export function MSG_ORDER_REVIEW_WITH_DELIVERY(linesBlock, p) {
  return (
    `${MSG_ORDER_REVIEW_HEADER}\n${linesBlock}\n\n` +
    `Позиции: ${p.sub} ₽\n` +
    `Доставка: ${p.fee}\n` +
    `Итого: ${p.total} ₽\n\n` +
    `${DELIVERY_RULE_SHORT_RU}\n\n` +
    MSG_ORDER_REVIEW_CONFIRM
  );
}

export const MSG_ORDER_CART_CLEARED = 'Корзина пуста. Введите позиции снова.';

export const MSG_ORDER_REVIEW_HEADER = 'Проверьте заказ:';

export const MSG_ORDER_REVIEW_CONFIRM =
  '«Да» / «ок» — продолжить (имя и телефон).\nНовая строка позиций — заменить состав.\n«Назад» — к позициям.';

export const MSG_ORDER_REVIEW_UNCLEAR =
  'Не разобрал. «Да» — дальше, «назад» — к позициям, или строка позиций (1x2, 3 1 …).';

export const MSG_ORDER_BACK_TO_ITEMS = 'Введите позиции снова (формат выше).';

export const MSG_ORDER_ASK_NAME = 'Имя для заказа:';

export const MSG_ORDER_ASK_COMMENT = 'Комментарий к заказу («-» пропустить):';

export const MSG_ORDER_STATE_BROKEN = 'Сессия сбилась. Начните с «Оформить заказ» или оставьте заявку.';

/** @param {string} err */
export function MSG_ORDER_QUOTE_FAIL(err) {
  return `Не удалось посчитать: ${err}`;
}

/** @param {string} err */
export function MSG_ORDER_CREATE_FAIL(err) {
  return `Не удалось создать заказ: ${err}`;
}

/**
 * @param {string} id
 * @param {{ sub: string, fee: string, total: string }} sums рубли уже отформатированы
 * @param {string} lines кратко позиции
 * @param {string} date
 */
export function MSG_ORDER_CREATED(id, sums, lines, date) {
  return (
    `Заказ принят ✅\n№ ${id}\nДата: ${date}\n${lines}\n` +
    `Позиции: ${sums.sub} ₽\nДоставка: ${sums.fee}\nИтого: ${sums.total} ₽\n\n` +
    `${DELIVERY_RULE_SHORT_RU}\n\n` +
    'При необходимости уточним по телефону.'
  );
}

export const MSG_ORDER_LINK_PREFIX = 'Сайт:';

export const MSG_MENU_BODY_PLACEHOLDER = 'Текст в CRM пустой.';
