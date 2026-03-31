/**
 * Детерминированное сопоставление заказа (attributionJson) с ContentItem.
 * База: utm_source, utm_campaign, utm_content (пустая строка ≡ отсутствие в JSON после sanitize).
 * Если у заказа в атрибуции есть непустой landing_path — он должен совпадать с каноническим путём материала
 * (как pathname в generatedUrl). Если landing_path у заказа нет — матч только по UTM-тройке (совместимость со старыми заказами).
 */

/**
 * @param {unknown} v
 */
function normAtt(v) {
  return String(v == null ? '' : v).trim();
}

/**
 * Канонический путь лендинга материала — как в contentGeneratedUrl.
 * @param {{ landingPath?: string | null, targetUrl?: string | null }} item
 */
export function contentItemExpectedLandingPath(item) {
  const tu = item.targetUrl != null ? String(item.targetUrl).trim() : '';
  if (tu && /^https?:\/\//i.test(tu)) {
    try {
      const u = new URL(tu);
      return u.pathname || '/';
    } catch {
      return '/';
    }
  }
  const lp = item.landingPath != null ? String(item.landingPath).trim() : '';
  if (!lp) return '/';
  return lp.startsWith('/') ? lp : `/${lp}`;
}

function normalizePathForCompare(p) {
  const s = normAtt(p);
  if (!s) return '/';
  return s.startsWith('/') ? s : `/${s}`;
}

/**
 * @param {Record<string, string> | null | undefined} att
 * @param {{ utmSource: string, utmCampaign?: string | null, utmContent?: string | null, landingPath?: string | null, targetUrl?: string | null }} item
 */
export function attributionMatchesContentItem(att, item) {
  if (!att || typeof att !== 'object') return false;
  if (normAtt(att.utm_source) !== normAtt(item.utmSource)) return false;
  if (normAtt(att.utm_campaign) !== normAtt(item.utmCampaign ?? '')) return false;
  if (normAtt(att.utm_content) !== normAtt(item.utmContent ?? '')) return false;
  const orderLp = normAtt(att.landing_path);
  if (orderLp !== '') {
    const expected = contentItemExpectedLandingPath(item);
    if (normalizePathForCompare(orderLp) !== normalizePathForCompare(expected)) return false;
  }
  return true;
}
