/**
 * CORS через существующий пакет `cors` (без новых зависимостей).
 */

import cors from 'cors';

function isProductionLike() {
  return process.env.NODE_ENV === 'production' || process.env.POLDEN_PRODUCTION_LIKE === '1';
}

function parseOriginList() {
  const explicit = (process.env.POLDEN_CORS_ORIGINS || '').trim();
  const raw = explicit
    ? explicit
    : [
        process.env.PUBLIC_SITE_ORIGIN,
        process.env.CRM_FRONTEND_ORIGIN,
        process.env.CRM_FRONTEND_ORIGINS
      ]
        .filter(Boolean)
        .join(',');

  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * @returns {import('cors').CorsOptions}
 */
export function buildCorsOptions() {
  const prodLike = isProductionLike();
  const allowed = parseOriginList();
  const unique = [...new Set(allowed)];

  if (!prodLike) {
    return {
      origin: true,
      credentials: true
    };
  }

  return {
    origin(origin, cb) {
      if (!origin) return cb(null, true);
      if (unique.includes(origin)) return cb(null, true);
      return cb(null, false);
    },
    credentials: true
  };
}

export function createCorsMiddleware() {
  return cors(buildCorsOptions());
}
