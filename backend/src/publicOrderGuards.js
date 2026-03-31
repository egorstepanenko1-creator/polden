/**
 * Публичные эндпоинты заказа: Content-Type, rate limit (in-memory), honeypot, длины полей.
 * Без новых npm-зависимостей.
 */

const HP_FIELD = 'polden_hp';

/** @type {Map<string, number[]>} */
const hitBuckets = new Map();

function pruneBucket(tsList, now, windowMs) {
  return tsList.filter((t) => now - t < windowMs);
}

/**
 * @param {{ windowMs: number, max: number, name: string }} opts
 */
export function createPublicOrderRateLimit(opts) {
  const { windowMs, max, name } = opts;
  return function publicOrderRateLimit(req, res, next) {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const key = `${name}:${ip}`;
    const now = Date.now();
    let arr = hitBuckets.get(key) || [];
    arr = pruneBucket(arr, now, windowMs);
    if (arr.length >= max) {
      const retrySec = Math.max(1, Math.ceil(windowMs / 1000));
      res.set('Retry-After', String(retrySec));
      return res.status(429).json({
        ok: false,
        error: {
          message: 'Слишком много запросов, повторите позже',
          code: 'RATE_LIMIT'
        }
      });
    }
    arr.push(now);
    hitBuckets.set(key, arr);
    next();
  };
}

/**
 * Ранний guard: POST на публичные пути заказа только с JSON Content-Type.
 */
export function requirePublicOrderJsonContentType(req, res, next) {
  if (req.method !== 'POST') return next();
  const p = req.path || '';
  if (
    p !== '/api/public/delivery-orders/quote' &&
    p !== '/api/public/delivery-orders' &&
    p !== '/api/public/corporate-leads'
  ) {
    return next();
  }
  const ct = String(req.headers['content-type'] || '').toLowerCase();
  if (!ct.includes('application/json')) {
    return res.status(415).json({
      ok: false,
      error: {
        message: 'Требуется Content-Type: application/json',
        code: 'UNSUPPORTED_MEDIA_TYPE'
      }
    });
  }
  next();
}

export const HONEYPOT_FIELD = HP_FIELD;

export const PUBLIC_ORDER_FIELD_LIMITS = {
  customerName: 120,
  address: 500,
  comment: 2000,
  /** после нормализации цифр — верхняя граница сырой строки */
  customerPhoneRaw: 32
};

/**
 * Honeypot: поле должно быть пустым. Имя согласовано с project/landing-order/index.html.
 * @param {Record<string, unknown>} body
 * @returns {{ ok: true } | { ok: false, message: string }}
 */
export function checkPublicOrderHoneypot(body) {
  if (!body || typeof body !== 'object') return { ok: true };
  const v = body[HP_FIELD];
  if (v == null) return { ok: true };
  const s = String(v).trim();
  if (s.length === 0) return { ok: true };
  return { ok: false, message: 'Запрос отклонён' };
}

/**
 * @param {Record<string, unknown>} body
 * @returns {{ ok: true, trimmed: { customerName: string, address?: string, comment?: string, customerPhone: string } } | { ok: false, message: string }}
 */
export function guardPublicOrderFieldLengths(body) {
  const name = String(body?.customerName ?? '').trim();
  const address = body?.address != null ? String(body.address).trim() : '';
  const comment = body?.comment != null ? String(body.comment).trim() : '';
  const phoneRaw = String(body?.customerPhone ?? '');

  if (name.length > PUBLIC_ORDER_FIELD_LIMITS.customerName) {
    return { ok: false, message: 'Имя слишком длинное' };
  }
  if (address.length > PUBLIC_ORDER_FIELD_LIMITS.address) {
    return { ok: false, message: 'Адрес слишком длинный' };
  }
  if (comment.length > PUBLIC_ORDER_FIELD_LIMITS.comment) {
    return { ok: false, message: 'Комментарий слишком длинный' };
  }
  if (phoneRaw.length > PUBLIC_ORDER_FIELD_LIMITS.customerPhoneRaw) {
    return { ok: false, message: 'Некорректный телефон' };
  }
  return {
    ok: true,
    trimmed: {
      customerName: name,
      address: address || undefined,
      comment: comment || undefined,
      customerPhone: phoneRaw
    }
  };
}

/** Лимиты полей публичной B2B-заявки (корпоративный обед). */
export const PUBLIC_CORPORATE_LEAD_LIMITS = {
  companyName: 200,
  contactName: 120,
  city: 120,
  address: 500,
  preferredDeliveryTime: 120,
  comment: 2000,
  phoneRaw: 32
};

/**
 * @param {Record<string, unknown>} body
 * @returns {{ ok: true, trimmed: Record<string, unknown> } | { ok: false, message: string }}
 */
export function guardCorporateLeadFieldLengths(body) {
  const companyName = String(body?.companyName ?? '').trim();
  const contactName = String(body?.contactName ?? '').trim();
  const city = String(body?.city ?? '').trim();
  const address = String(body?.address ?? '').trim();
  const preferredDeliveryTime =
    body?.preferredDeliveryTime != null ? String(body.preferredDeliveryTime).trim() : '';
  const comment = body?.comment != null ? String(body.comment).trim() : '';
  const phoneRaw = String(body?.phone ?? '');

  if (companyName.length > PUBLIC_CORPORATE_LEAD_LIMITS.companyName) {
    return { ok: false, message: 'Название компании слишком длинное' };
  }
  if (contactName.length > PUBLIC_CORPORATE_LEAD_LIMITS.contactName) {
    return { ok: false, message: 'Имя контакта слишком длинное' };
  }
  if (city.length > PUBLIC_CORPORATE_LEAD_LIMITS.city) {
    return { ok: false, message: 'Город указан слишком длинной строкой' };
  }
  if (address.length > PUBLIC_CORPORATE_LEAD_LIMITS.address) {
    return { ok: false, message: 'Адрес слишком длинный' };
  }
  if (preferredDeliveryTime.length > PUBLIC_CORPORATE_LEAD_LIMITS.preferredDeliveryTime) {
    return { ok: false, message: 'Поле времени доставки слишком длинное' };
  }
  if (comment.length > PUBLIC_CORPORATE_LEAD_LIMITS.comment) {
    return { ok: false, message: 'Комментарий слишком длинный' };
  }
  if (phoneRaw.length > PUBLIC_CORPORATE_LEAD_LIMITS.phoneRaw) {
    return { ok: false, message: 'Некорректный телефон' };
  }
  return {
    ok: true,
    trimmed: {
      companyName,
      contactName,
      city,
      address,
      preferredDeliveryTime: preferredDeliveryTime || undefined,
      comment: comment || undefined,
      phone: phoneRaw,
      headcountEstimate: body?.headcountEstimate
    }
  };
}
