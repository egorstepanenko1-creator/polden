/**
 * Пользовательские строки CRM (RU). Ключи API, маршруты и enum в БД не меняем — только подписи в UI.
 */

export const nav = {
  brand: 'Полдень · CRM',
  ordersKpi: 'Заказы и KPI',
  content: 'Контент',
  launchDrill: 'Запусковый дрилл',
  vkLeads: 'Лиды VK',
  kitchen: 'Кухня: справочники',
  menuDay: 'Меню на день',
  dayEconomics: 'Экономика дня',
  dayProduction: 'Производство',
  stockDesk: 'Склад: движения',
  inventoryCount: 'Инвентаризация',
  productionStockGap: 'Запас vs план',
  purchaseNeedSnapshot: 'К закупке',
  purchaseDrafts: 'Черновики закупки',
  procurementBoard: 'Доска закупок',
  suppliers: 'Поставщики',
  productionWriteoff: 'Списание произв.',
  b2b: 'B2B · корп. обеды'
};

/** Статусы B2B-лида (корп. заявка). */
export function corporateLeadStatusLabel(code) {
  const m = {
    NEW: 'Новый',
    CONTACTED: 'На связи',
    QUOTED: 'КП отправлено',
    PILOT: 'Пилот',
    ACTIVE: 'В работе (компания)',
    LOST: 'Закрыт'
  };
  return m[String(code || '')] || code;
}

/** Статусы карточки компании B2B. */
export function companyAccountStatusLabel(code) {
  const m = {
    NEW: 'Новая',
    ACTIVE: 'Активна',
    PAUSED: 'Пауза',
    LOST: 'Потеряна'
  };
  return m[String(code || '')] || code;
}

/** Статусы материалов контента (значения в API — англ.). */
export function contentStatusLabel(code) {
  const m = {
    IDEA: 'Идея',
    DRAFT: 'Черновик',
    APPROVED: 'Согласовано',
    PUBLISHED: 'Опубликовано'
  };
  return m[String(code || '')] || code;
}

/** Статусы лидов VK (значения в API — англ.). */
export function vkLeadStatusLabel(code) {
  const m = {
    NEW: 'Новый',
    CONTACTED: 'В контакте',
    CONVERTED: 'Конвертирован',
    REJECTED: 'Отклонён'
  };
  return m[String(code || '')] || code;
}

/** Статусы заказа (значения в БД — англ.). */
export function orderStatusLabel(code) {
  const m = {
    NEW: 'Новый',
    CONFIRMED: 'Подтверждён',
    KITCHEN: 'Кухня',
    DELIVERING: 'Доставка',
    DONE: 'Завершён',
    CANCELED: 'Отменён'
  };
  return m[String(code || '')] || code;
}

/** Канал заказа (значения в БД — англ.). */
export function orderSourceChannelLabel(code) {
  const m = {
    SITE: 'Сайт',
    VK: 'VK',
    MANUAL: 'Вручную (CRM)',
    PHONE: 'Телефон'
  };
  return m[String(code || '')] || code;
}

export const ORDER_STATUS_OPTIONS = ['NEW', 'CONFIRMED', 'KITCHEN', 'DELIVERING', 'DONE', 'CANCELED'];

export const ORDER_SOURCE_CHANNEL_OPTIONS = ['SITE', 'VK', 'MANUAL', 'PHONE'];

/** Статусы запускового дрилла. */
export function launchDrillRunStatusLabel(code) {
  const m = {
    STARTED: 'Начат',
    SUCCESS: 'Успешно',
    FAILED: 'С ошибкой',
    PARTIAL: 'Частично'
  };
  return m[String(code || '')] || code;
}

/** Статусы версии рецепта (как приходит с API). */
export function recipeVersionStatusLabel(code) {
  const m = {
    draft: 'черновик',
    published: 'опубликовано'
  };
  return m[String(code || '')] || code;
}

export const vkReadiness = {
  readyTitle: 'Готов к пробному запуску VK',
  blockedTitle: 'Есть препятствия (см. список)',
  loading: 'Загрузка готовности VK…',
  panelTitle: 'Готовность пробного запуска VK',
  linkOk: 'в порядке',
  linkNeedsOrigin: 'нужен PUBLIC_SITE_ORIGIN или целевой URL',
  crmTokenEnvYes: 'задан в .env',
  crmTokenEnvNo: 'нет (режим dev по умолчанию)'
};

export const pages = {
  contentPipelineTitle: 'Контент-пайплайн',
  stockDeskTitle: 'Склад: движения',
  kitchenLabTitle: 'Кухня: справочники',
  launchDrillTitle: 'Запусковый дрилл'
};

/** Подписи итога при завершении дрилла (значения SUCCESS/PARTIAL/FAILED не меняем). */
export const launchDrillCompleteLabels = {
  SUCCESS: 'Успех — цепочка подтверждена',
  PARTIAL: 'Частично (опишите в примечании)',
  FAILED: 'Не сошлось'
};

export const kitchen = {
  labelUnitCode: 'Код единицы',
  labelUnitDisplayName: 'Название для отображения',
  priceEffectiveToNull: 'Без даты окончания'
};
