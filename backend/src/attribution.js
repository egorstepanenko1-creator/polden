const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
const PATH_KEYS = ['landing_path', 'referrer'];
/** Трассировка заказа из VK-бота (не UTM). */
const VK_TRACE_KEYS = ['vk_peer_id', 'vk_user_id', 'order_capture'];
const UTM_MAX = 256;
const PATH_MAX = 512;
const VK_TRACE_MAX = 64;

function trimCap(s, max) {
  const t = String(s == null ? '' : s).trim();
  if (!t) return '';
  return t.length <= max ? t : t.slice(0, max);
}

/**
 * @param {unknown} raw
 * @returns {Record<string, string> | null}
 */
export function sanitizeAttribution(raw) {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  /** @type {Record<string, string>} */
  const out = {};
  for (const k of UTM_KEYS) {
    if (!(k in raw)) continue;
    const v = trimCap(raw[k], UTM_MAX);
    if (v) out[k] = v;
  }
  for (const k of PATH_KEYS) {
    if (!(k in raw)) continue;
    const v = trimCap(raw[k], PATH_MAX);
    if (v) out[k] = v;
  }
  for (const k of VK_TRACE_KEYS) {
    if (!(k in raw)) continue;
    const v = trimCap(raw[k], VK_TRACE_MAX);
    if (v) out[k] = v;
  }
  return Object.keys(out).length ? out : null;
}

/**
 * @param {string | null | undefined} json
 * @returns {Record<string, string> | null}
 */
export function parseAttributionJson(json) {
  if (json == null || json === '') return null;
  try {
    const o = JSON.parse(json);
    if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
    return sanitizeAttribution(o);
  } catch {
    return null;
  }
}
