/**
 * Минимальная проверка конфигурации при старте (production-like режим).
 */

function isProductionLike() {
  return process.env.NODE_ENV === 'production' || process.env.POLDEN_PRODUCTION_LIKE === '1';
}

/**
 * Вызывать до app.listen. При нарушении — process.exit(1).
 */
export function validateProductionLikeConfig() {
  if (!isProductionLike()) return;

  const token = (process.env.CRM_INTERNAL_TOKEN ?? '').trim();
  if (!token) {
    console.error(
      '[polden] FATAL: в production-like режиме задайте CRM_INTERNAL_TOKEN (непустой) для защищённых маршрутов CRM.'
    );
    process.exit(1);
  }
  if (token === 'dev' && process.env.POLDEN_ALLOW_DEV_CRM_TOKEN !== '1') {
    console.error(
      '[polden] FATAL: CRM_INTERNAL_TOKEN=dev в production-like режиме запрещён. Задайте секрет или POLDEN_ALLOW_DEV_CRM_TOKEN=1 (только осознанно).'
    );
    process.exit(1);
  }

  const vkSecret = (process.env.VK_WEBHOOK_SECRET ?? '').trim();
  if (!vkSecret && process.env.POLDEN_ALLOW_EMPTY_VK_WEBHOOK_SECRET !== '1') {
    console.error(
      '[polden] FATAL: в production-like режиме VK_WEBHOOK_SECRET обязателен (Callback API). Для локальной имитации: POLDEN_ALLOW_EMPTY_VK_WEBHOOK_SECRET=1.'
    );
    process.exit(1);
  }
  if (!vkSecret && process.env.POLDEN_ALLOW_EMPTY_VK_WEBHOOK_SECRET === '1') {
    console.warn(
      '[polden] WARN: VK_WEBHOOK_SECRET пуст — проверка secret в /api/vk/webhook отключена (только для dev).'
    );
  }

  const corsExplicit = (process.env.POLDEN_CORS_ORIGINS || '').trim();
  const corsOrigins =
    corsExplicit ||
    (process.env.PUBLIC_SITE_ORIGIN || '').trim() ||
    (process.env.CRM_FRONTEND_ORIGIN || '').trim() ||
    (process.env.CRM_FRONTEND_ORIGINS || '').trim();
  if (!corsOrigins) {
    console.error(
      '[polden] FATAL: в production-like режиме задайте источники CORS: POLDEN_CORS_ORIGINS и/или PUBLIC_SITE_ORIGIN и/или CRM_FRONTEND_ORIGIN(S). См. docs/PUBLIC_ORDER_HARDENING.md.'
    );
    process.exit(1);
  }
}

/**
 * Предупреждения для обычной разработки (не валят процесс).
 */
export function warnWeakDevConfig() {
  if (isProductionLike()) return;
  if (!(process.env.CRM_INTERNAL_TOKEN || '').trim()) {
    console.warn('[polden] WARN: CRM_INTERNAL_TOKEN не задан — для защищённых маршрутов используется значение по умолчанию "dev".');
  }
  if (!(process.env.VK_WEBHOOK_SECRET || '').trim()) {
    console.warn(
      '[polden] WARN: VK_WEBHOOK_SECRET пуст — в dev это допустимо; в проде задайте секрет и уберите POLDEN_ALLOW_EMPTY_VK_WEBHOOK_SECRET.'
    );
  }
}
