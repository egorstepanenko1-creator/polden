/**
 * Детерминированная сборка ссылки для контент-пайплайна (UTM + landing_path для KPI).
 * Параметры запроса сортируются по ключу для стабильной строки.
 */

/** Плейсхолдер, если PUBLIC_SITE_ORIGIN не задан или невалиден (не ломает dev, но не для прод-ссылок). */
export const CONTENT_DEFAULT_SITE_ORIGIN = 'https://example.invalid';

/**
 * Разбор PUBLIC_SITE_ORIGIN для сборки ссылок и предупреждений в CRM.
 * localhost / 127.0.0.1 считаются нормальными для локальной разработки.
 * @returns {{ effectiveOrigin: string, code: 'ok' | 'missing_env_fallback' | 'invalid_env_fallback' | 'placeholder_hostname', isSafeForPublish: boolean }}
 */
export function resolvePublicSiteOriginMeta() {
  const raw = process.env.PUBLIC_SITE_ORIGIN;
  const trimmed = raw != null ? String(raw).trim() : '';
  if (!trimmed) {
    return {
      effectiveOrigin: CONTENT_DEFAULT_SITE_ORIGIN,
      code: 'missing_env_fallback',
      isSafeForPublish: false
    };
  }
  try {
    const normalized = trimmed.replace(/\/$/, '');
    const u = new URL(normalized);
    if (!/^https?:$/i.test(u.protocol)) {
      return {
        effectiveOrigin: CONTENT_DEFAULT_SITE_ORIGIN,
        code: 'invalid_env_fallback',
        isSafeForPublish: false
      };
    }
    const host = u.hostname.toLowerCase();
    if (host === 'example.invalid') {
      return {
        effectiveOrigin: normalized,
        code: 'placeholder_hostname',
        isSafeForPublish: false
      };
    }
    return { effectiveOrigin: normalized, code: 'ok', isSafeForPublish: true };
  } catch {
    return {
      effectiveOrigin: CONTENT_DEFAULT_SITE_ORIGIN,
      code: 'invalid_env_fallback',
      isSafeForPublish: false
    };
  }
}

/**
 * Материал собирает URL от публичного origin (а не только от полного targetUrl).
 * @param {{ targetUrl?: string | null }} item
 */
export function contentItemUsesSiteOriginForGeneratedUrl(item) {
  const tu = item.targetUrl != null ? String(item.targetUrl).trim() : '';
  return !tu || !/^https?:\/\//i.test(tu);
}

/**
 * Безопасность generatedUrl с точки зрения публикации (не заглушка origin).
 * @param {{ targetUrl?: string | null, landingPath?: string | null }} item
 * @returns {{ code: string, isSafeForPublish: boolean }}
 */
export function getContentItemGeneratedUrlSafety(item) {
  if (!contentItemUsesSiteOriginForGeneratedUrl(item)) {
    return { code: 'ok_external_target', isSafeForPublish: true };
  }
  const meta = resolvePublicSiteOriginMeta();
  if (meta.code === 'ok') return { code: 'ok', isSafeForPublish: true };
  return { code: meta.code, isSafeForPublish: false };
}

/**
 * Для APPROVED/PUBLISHED — слабые поля атрибуции (не блокируем сохранение, только предупреждение).
 * @param {{ status?: string, landingPath?: string | null, targetUrl?: string | null, utmCampaign?: string | null, utmContent?: string | null }} row
 * @returns {string[]}
 */
export function contentPublishAttributionWarnings(row) {
  /** @type {string[]} */
  const warnings = [];
  const st = String(row.status || '').toUpperCase();
  if (st !== 'APPROVED' && st !== 'PUBLISHED') return warnings;
  const lp = row.landingPath != null && String(row.landingPath).trim();
  const tu = row.targetUrl != null && String(row.targetUrl).trim();
  if (!lp && !tu) warnings.push('no_landing_or_target');
  const camp = row.utmCampaign != null ? String(row.utmCampaign).trim() : '';
  const cont = row.utmContent != null ? String(row.utmContent).trim() : '';
  if (!camp && !cont) warnings.push('no_utm_campaign_or_content');
  return warnings;
}

/**
 * @param {{
 *   publicOrigin?: string,
 *   channel: string,
 *   landingPath?: string | null,
 *   targetUrl?: string | null,
 *   utmSource?: string | null,
 *   utmMedium?: string | null,
 *   utmCampaign?: string | null,
 *   utmContent?: string | null
 * }} input
 * @returns {string}
 */
export function buildContentGeneratedUrl(input) {
  let origin;
  if (input.publicOrigin != null && String(input.publicOrigin).trim() !== '') {
    origin = String(input.publicOrigin).replace(/\/$/, '');
  } else {
    origin = resolvePublicSiteOriginMeta().effectiveOrigin;
  }

  let pathname = '/';
  /** @type {URL} */
  let url;

  const tu = input.targetUrl != null ? String(input.targetUrl).trim() : '';
  if (tu && /^https?:\/\//i.test(tu)) {
    url = new URL(tu);
    pathname = url.pathname || '/';
  } else {
    const lp = input.landingPath != null ? String(input.landingPath).trim() : '';
    pathname = lp ? (lp.startsWith('/') ? lp : `/${lp}`) : '/';
    url = new URL(pathname, `${origin}/`);
  }

  const ch = String(input.channel || '').toUpperCase();
  let source = String(input.utmSource ?? '').trim();
  if (!source && ch === 'VK') source = 'vk';

  /** @type {Array<[string, string]>} */
  const pairs = [];

  if (source) pairs.push(['utm_source', source]);
  const med = String(input.utmMedium ?? '').trim();
  if (med) pairs.push(['utm_medium', med]);
  const camp = String(input.utmCampaign ?? '').trim();
  if (camp) pairs.push(['utm_campaign', camp]);
  const cont = String(input.utmContent ?? '').trim();
  if (cont) pairs.push(['utm_content', cont]);

  const pathForAttribution = pathname || '/';
  pairs.push(['landing_path', pathForAttribution]);

  pairs.sort((a, b) => a[0].localeCompare(b[0]));

  const base = `${url.origin}${url.pathname}`;
  const q = new URLSearchParams(pairs).toString();
  return q ? `${base}?${q}` : base;
}
