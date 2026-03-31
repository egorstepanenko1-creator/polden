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
