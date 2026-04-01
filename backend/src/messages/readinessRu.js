/**
 * Тексты ответа GET /api/vk-bot/readiness (для операторов CRM, RU).
 */

export const CRM_TOKEN_HINT =
  'На фронте переменная VITE_CRM_TOKEN должна совпадать с CRM_INTERNAL_TOKEN на бэкенде (если токен не задан в .env, используется значение dev).';

/** Правило выбора меню — человекочитаемо, внутренние ключи сохранены для отладки. */
export const MENU_CONTENT_RULE_RU =
  'Материал: канал VK, тип MENU_DAILY, статусы APPROVED или PUBLISHED; берётся сначала по дате публикации, затем по обновлению.';

export const BLOCKER_NO_GROUP_TOKEN = 'Нужен VK_GROUP_ACCESS_TOKEN в .env бэкенда.';

export const BLOCKER_NO_CONFIRMATION = 'Нужен VK_CALLBACK_CONFIRMATION_CODE (строка из VK при подключении Callback).';

export const BLOCKER_NO_MENU =
  'Нет материала MENU_DAILY (VK, APPROVED/PUBLISHED). Запустите: npm run db:ensure-vk-menu-drill';

export const BLOCKER_MENU_CAPTION_SHORT =
  'У текущего меню дня слишком короткий текст в поле «черновик подписи» (нужно не меньше 20 символов).';

export const BLOCKER_MENU_URL_UNSAFE =
  'Ссылка в меню не готова к публикации: задайте PUBLIC_SITE_ORIGIN или полный https-адрес в targetUrl материала.';

export const BLOCKER_VK_ORDERABLE_MENU_EMPTY =
  'Для заказа из VK на «завтра» нет строк меню с названием в CRM (MenuDayItem): заполните «Меню на день» для первой/единственной точки.';

export const BLOCKER_NO_BRANCH_IN_DB = 'В БД нет ни одной точки (Branch) — заказ из VK недоступен.';

/**
 * Пояснение для CRM: как зафиксирована точка для VK-меню/заказа (см. vkBranchResolve).
 * @param {boolean} multiBranchMenuBlocked
 * @param {boolean} hasForcedBranch
 */
export function VK_ORDER_PROBE_NOTE_RU(multiBranchMenuBlocked, hasForcedBranch) {
  if (multiBranchMenuBlocked) {
    return (
      'Несколько точек в БД без POLDEN_VK_DEFAULT_BRANCH_ID или POLDEN_VK_ORDER_PROBE_BRANCH_ID: «Меню» не выберет точку автоматически; в «Оформить заказ» точка выбирается номером.'
    );
  }
  if (hasForcedBranch) {
    return 'Точка для меню и заказа определена (одна Branch в БД или задан env DEFAULT/PROBE).';
  }
  return 'Нет выбранной точки для предпросмотра (проверьте Branch в БД).';
}

/** Диагностика для CRM: почему клиент видит текст про «заявку приняту» vs заказ. */
export const VK_DIAG_LEAD_ACCEPTED_EXPLANATION =
  'Сообщение «Заявка принята…» в боте отправляется только после полного сценария «Оставить заявку» (имя → телефон → адрес → дата → комментарий). Это не ответ API создания DeliveryOrder.';

export const VK_DIAG_ORDER_BUTTON_RESETS_LEAD =
  'Если пользователь начал «Оставить заявку», затем нажал «Оформить заказ», черновик заявки сбрасывается и открывается заказ на завтра (нужен MenuDayItem с названиями в CRM).';
