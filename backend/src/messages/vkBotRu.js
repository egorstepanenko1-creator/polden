/**
 * Тексты VK-бота для пользователя (RU). Логика состояний не меняется.
 */

export const VK_BOT_DEFAULT_OPERATOR_HINT =
  'Напишите нам в ответ на это сообщение или позвоните — оператор свяжется с вами. Чтобы снова открыть меню, нажмите «Меню».';

export const MSG_LEAD_CANCELLED = 'Заявка отменена. Выберите действие кнопками ниже.';

export const MSG_MENU_FOOTER =
  'Вопросы — «Связаться с оператором». Заявку перезвонит оператор — «Оставить заявку».';

/** Перед текстом MENU_DAILY: прямой заказ в приоритете, блок CRM — ориентир. */
export const MSG_VK_MENU_CONTEXT_LINE =
  'Главный шаг — «Оформить заказ»: на завтра, состав и цены как в CRM. Ниже — кратко день из CRM.';

export const MSG_VK_MENU_TRUNC_HINT =
  'Если не всё поместилось — ссылка на сайт ниже или оператор.';

export const MSG_MENU_EMPTY =
  'Меню дня в CRM ещё не опубликовано (VK, тип «меню дня», статус согласован/опубликован). Когда появится — «Оформить заказ» или оператор.';

export const MSG_ASK_NAME = 'Как вас зовут? (или напишите «Отмена»)';

export const MSG_NAME_TOO_SHORT = 'Введите имя не короче 2 символов или «Отмена».';

export const MSG_ASK_PHONE = 'Телефон (например +7 900 000-00-00):';

export const MSG_PHONE_INVALID =
  'Номер не подходит. Нужен российский номер: 11 цифр, начинается с 7. Или «Отмена».';

export const MSG_ASK_ADDRESS = 'Адрес доставки (кратко):';

export const MSG_ADDRESS_TOO_SHORT = 'Укажите адрес не короче 3 символов или «Отмена».';

export const MSG_ASK_DELIVERY_DATE = 'Желаемая дата доставки (любым текстом, как вам удобно):';

export const MSG_DATE_EMPTY = 'Укажите дату текстом или «Отмена».';

export const MSG_ASK_COMMENT = 'Комментарий к заявке (или «-», если добавить нечего):';

export const MSG_LEAD_ACCEPTED =
  'Заявка принята. Мы свяжемся с вами. Заказ оформит оператор после уточнения.\n\nСпасибо!';

export const MSG_IDLE_CHOOSE =
  'Кнопки: «Оформить заказ» (завтра) · «Меню» · «Связаться с оператором» · «Оставить заявку».';

export const MSG_ORDER_NO_BRANCHES = 'В системе нет точек доставки — онлайн-заказ из бота сейчас недоступен.';

export const MSG_ORDER_FALLBACK_LEAD =
  'Можно оставить заявку кнопкой «Оставить заявку» — оператор свяжется и оформит заказ.';

export const MSG_ORDER_MENU_EMPTY =
  'На выбранную дату в CRM нет заполненного меню (названия позиций). Онлайн-заказ из бота недоступен.';

/** @param {string} branchName @param {string} date */
export function MSG_ORDER_INTRO_SINGLE_BRANCH(branchName, date) {
  return `Оформление заказа: точка «${branchName}», дата доставки ${date} (как «завтра» на сайте).`;
}

/** @param {string} list @param {string} date */
export function MSG_ORDER_PICK_BRANCH(list, date) {
  return `Оформление заказа. Дата доставки: ${date}.\nВыберите точку номером:\n${list}`;
}

export const MSG_ORDER_BRANCH_HINT = 'Ответьте одной цифрой (1, 2, …) или «Отмена».';

/** @param {number} max */
export function MSG_ORDER_BRANCH_INVALID(max) {
  return `Нужен номер от 1 до ${max}. Или «Отмена».`;
}

/** @param {string} name @param {string} date */
export function MSG_ORDER_BRANCH_PICKED(name, date) {
  return `Точка: ${name}, дата доставки ${date}.`;
}

export const MSG_ORDER_ITEMS_HINT =
  'Отправьте позиции в формате:\n• 1x2 — две порции позиции 1\n• 1 2, 3 1 — то же через пробел, можно несколько через запятую\nДиапазон позиций 1–10, количество 1–99.\n«Сброс» — очистить черновик корзины.';

export const MSG_ORDER_CART_CLEARED = 'Корзина очищена. Отправьте позиции снова.';

export const MSG_ORDER_REVIEW_HEADER = 'Корзина:';

export const MSG_ORDER_REVIEW_CONFIRM =
  'Отправьте «да» или «ок», чтобы продолжить (имя и телефон).\nИли новую строку позиций, чтобы заменить корзину.\n«Назад» — изменить состав.';

export const MSG_ORDER_REVIEW_UNCLEAR =
  'Не понял. Ответьте «да» для продолжения, «назад» к позициям, или пришлите новую строку позиций (1x2, 3 1, …).';

export const MSG_ORDER_BACK_TO_ITEMS = 'Пришлите позиции снова (см. формат выше).';

export const MSG_ORDER_ASK_NAME = 'Как вас зовут? (для заказа)';

export const MSG_ORDER_ASK_COMMENT = 'Комментарий к заказу (или «-» пропустить):';

export const MSG_ORDER_STATE_BROKEN = 'Сессия заказа сбита. Начните с «Оформить заказ» или оставьте заявку.';

/** @param {string} err */
export function MSG_ORDER_QUOTE_FAIL(err) {
  return `Не получилось посчитать заказ: ${err}`;
}

/** @param {string} err */
export function MSG_ORDER_CREATE_FAIL(err) {
  return `Не удалось создать заказ: ${err}`;
}

/** @param {string} id @param {string} rub @param {string} lines @param {string} date */
export function MSG_ORDER_CREATED(id, rub, lines, date) {
  return `Заказ оформлен ✅\nНомер: ${id}\nДата доставки: ${date}\nСостав: ${lines}\nСумма: ${rub} ₽\n\nСпасибо! При необходимости мы уточним детали по телефону.`;
}


/** Строка со ссылкой на сайт в блоке меню (не путать с кнопкой «Оформить заказ» в боте). */
export const MSG_ORDER_LINK_PREFIX = 'Сайт:';

/** Если в CRM нет ни заголовка, ни текста меню */
export const MSG_MENU_BODY_PLACEHOLDER = 'Текст меню в CRM пока пустой.';
