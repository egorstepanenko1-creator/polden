import { DELIVERY_RULE_SHORT_RU } from '../deliveryFeePolicy.js';

export { DELIVERY_RULE_SHORT_RU };

export const VK_BOT_DEFAULT_OPERATOR_HINT =
  'Напишите нам — ответим быстро. Принимаем заказы до 21:00, доставляем с 11:30 до 14:00.\n\nЧтобы оформить заказ — нажмите «Оформить заказ 🍱».';

export const MSG_LEAD_CANCELLED = 'Окей, прервали. Чем могу помочь?';

export const MSG_MENU_FOOTER =
  'Нажмите «Оформить заказ 🍱» — оформим по шагам за минуту.';

export const MSG_MENU_NO_BRANCH = 'Меню пока не заполнено. Напишите нам — подскажем.';

export const MSG_MENU_MULTI_BRANCH_HINT =
  'Нажмите «Оформить заказ 🍱» — выберете точку и увидите актуальное меню.';

/** @param {string} branchName @param {string} date */
export function MSG_MENU_EMPTY_CRM(branchName, date) {
  return `Меню на ${date} ещё не опубликовано. Напишите нам — уточним.`;
}

/** @param {string} branchName @param {string} date @param {string} listBlock */
export function MSG_MENU_CRM_PRIMARY(branchName, date, listBlock) {
  return `Меню на завтра, ${date}:\n\n${listBlock}`;
}

export const MSG_MENU_OPTIONAL_CONTENT_SEPARATOR = '';
export const MSG_VK_MENU_TRUNC_HINT = 'Подробности у оператора.';
export const MSG_VK_MENU_CONTEXT_LINE = '';
export const MSG_MENU_EMPTY = 'Меню на завтра пока не готово. Уточните у оператора.';
export const MSG_MENU_BODY_PLACEHOLDER = '';

export const MSG_ASK_NAME = 'Как вас зовут?';
export const MSG_NAME_TOO_SHORT = 'Введите имя (минимум 2 буквы):';
export const MSG_ASK_PHONE = 'Ваш номер телефона:';
export const MSG_PHONE_INVALID = 'Не похоже на номер. Попробуйте в формате +7 900 000-00-00:';
export const MSG_ASK_ADDRESS = 'Адрес доставки:';
export const MSG_ADDRESS_TOO_SHORT = 'Уточните адрес подробнее:';
export const MSG_ASK_DELIVERY_DATE = 'На какую дату? (например: завтра, 15 апреля):';
export const MSG_DATE_EMPTY = 'Укажите дату:';
export const MSG_ASK_COMMENT = 'Комментарий к заказу? (или напишите «-»):';

export const MSG_LEAD_ACCEPTED =
  'Заявку приняли ✅ Оператор свяжется с вами и уточнит детали.';

export const MSG_IDLE_CHOOSE =
  'Нажмите «Оформить заказ 🍱» — оформим по шагам за минуту.';

export const MSG_ORDER_NO_BRANCHES =
  'Заказ через бота временно недоступен. Напишите нам — оформим вручную.';

export const MSG_ORDER_FALLBACK_LEAD =
  'Оставьте заявку кнопкой ниже — оператор свяжется и оформит заказ.';

export const MSG_ORDER_MENU_EMPTY =
  'Меню на завтра ещё не готово. Напишите нам — уточним.';

/** @param {string} branchName @param {string} date */
export function MSG_ORDER_INTRO_SINGLE_BRANCH(branchName, date) {
  return `Заказ на завтра, ${date}. Выбираем блюда:`;
}

/** @param {string} list @param {string} date */
export function MSG_ORDER_PICK_BRANCH(list, date) {
  return `Заказ на завтра, ${date}. Выберите точку доставки:\n${list}`;
}

export const MSG_ORDER_BRANCH_HINT = 'Ответьте цифрой или напишите «Отмена».';

/** @param {number} max */
export function MSG_ORDER_BRANCH_INVALID(max) {
  return `Введите цифру от 1 до ${max}.`;
}

/** @param {string} name @param {string} date */
export function MSG_ORDER_BRANCH_PICKED(name, date) {
  return `Точка: ${name}, дата: ${date}.`;
}

export const MSG_ORDER_ITEMS_HINT =
  'Введите позиции, например: 1, 3, 5 или 1x2 (две порции).\n\n' +
  DELIVERY_RULE_SHORT_RU;

/** @param {string} date */
export function MSG_ORDER_GUIDE_INTRO(date) {
  return `Собираем заказ на ${date}.\n\n${DELIVERY_RULE_SHORT_RU}`;
}

/**
 * @param {string} title
 * @param {Array<{ position: number, name: string }>} slots
 */
export function MSG_ORDER_GUIDE_CATEGORY_PICK(title, slots) {
  const lines = slots.map((r, i) => `${i + 1} — ${String(r.name).trim()}`).join('\n');
  return `${title}:\n${lines}\n0 — пропустить\n\nВыберите цифру 0–${slots.length}.`;
}

/** @param {string} title */
export function MSG_ORDER_GUIDE_AFTER_PICK(title) {
  return `Добавлено ✓\n\nНажмите «Добавить ещё» или «Дальше».`;
}

/** @param {string} title */
export function MSG_ORDER_GUIDE_MORE_UNCLEAR(title) {
  return `Напишите «Добавить ещё» или «Дальше».`;
}

/** @param {number} maxChoice */
export function MSG_ORDER_GUIDE_PICK_INVALID(maxChoice) {
  return `Введите цифру от 0 до ${maxChoice}.`;
}

/**
 * @param {Array<{ position: number, name: string }>} extras
 */
export function MSG_ORDER_GUIDE_EXTRAS(extras) {
  const block = extras.map((r) => `${r.position}. ${String(r.name).trim()}`).join('\n');
  return `Дополнительно (по желанию):\n${block}\n\nНапишите номера, например: 7, 8 или «Пропустить».\n\n${DELIVERY_RULE_SHORT_RU}`;
}

export const MSG_ORDER_GUIDE_EXTRAS_RETRY =
  'Укажите номера позиций, например: 7, 9. Или «Пропустить».';
export const MSG_ORDER_GUIDE_EXTRAS_INVALID =
  'Не разобрал. Укажите номера или напишите «Пропустить».';
export const MSG_ORDER_GUIDE_EMPTY_CART =
  'Корзина пустая. Выберите блюда.';
export const MSG_ORDER_GUIDE_FALLBACK_HINT =
  'Ответьте цифрой или введите позиции.';

/**
 * @param {string} linesBlock
 * @param {{ sub: string, fee: string, total: string }} p
 */
export function MSG_ORDER_REVIEW_WITH_DELIVERY(linesBlock, p) {
  return (
    `${MSG_ORDER_REVIEW_HEADER}\n${linesBlock}\n\n` +
    `Блюда: ${p.sub} ₽\n` +
    `Доставка: ${p.fee}\n` +
    `Итого: ${p.total} ₽\n\n` +
    `${DELIVERY_RULE_SHORT_RU}\n\n` +
    MSG_ORDER_REVIEW_CONFIRM
  );
}

export const MSG_ORDER_CART_CLEARED = 'Корзина очищена. Введите позиции заново.';
export const MSG_ORDER_REVIEW_HEADER = 'Ваш заказ:';
export const MSG_ORDER_REVIEW_CONFIRM =
  '«Да» — оформить.\nИли напишите новый состав чтобы изменить.';
export const MSG_ORDER_REVIEW_UNCLEAR =
  'Напишите «да» чтобы подтвердить, или «назад» чтобы изменить состав.';
export const MSG_ORDER_BACK_TO_ITEMS = 'Введите позиции заново:';
export const MSG_ORDER_ASK_NAME = 'Ваше имя:';
export const MSG_ORDER_ASK_COMMENT = 'Комментарий к заказу? (или «Пропустить»):';
export const MSG_ORDER_STATE_BROKEN =
  'Что-то пошло не так. Нажмите «Собрать свой обед 🍱» и начнём заново.';

/** @param {string} err */
export function MSG_ORDER_QUOTE_FAIL(err) {
  return `Не смогли посчитать сумму. Напишите нам — оформим вручную.`;
}

/** @param {string} err */
export function MSG_ORDER_CREATE_FAIL(err) {
  return `Не смогли оформить заказ. Напишите нам — оформим вручную.`;
}

/**
 * @param {number} orderNum
 * @param {string} lines
 * @param {string} total
 * @param {string|null} deliveryLine
 * @param {string} date
 */
export function MSG_ORDER_CREATED(orderNum, lines, total, deliveryLine, date) {
  const totalSuffix = deliveryLine
    ? ` руб. (в т.ч. доставка ${deliveryLine})`
    : ' руб. (доставка бесплатно)';
  return `Заказ №${orderNum} принят ✅\n${date}\n\n${lines}\n\nИтого: ${total}${totalSuffix}\n\nДоставим с 11:30 до 14:00. Чтобы изменить или отменить — нажмите кнопку ниже.`;
}

export const MSG_ORDER_LINK_PREFIX = '';
