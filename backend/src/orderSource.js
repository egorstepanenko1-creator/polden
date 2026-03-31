/**
 * Компактный ключ источника для KPI: utm_source → иначе path/campaign → unknown.
 * @param {Record<string, string> | null | undefined} attribution
 */
export function orderSourceKey(attribution) {
  if (!attribution || typeof attribution !== 'object') return 'unknown';
  const u = String(attribution.utm_source || '').trim();
  if (u) return u.length <= 64 ? u : u.slice(0, 64);
  const path = String(attribution.landing_path || '').trim();
  if (path) {
    const short = path.length <= 48 ? path : path.slice(0, 48) + '…';
    return `path:${short}`;
  }
  const camp = String(attribution.utm_campaign || '').trim();
  if (camp) return camp.length <= 64 ? camp : camp.slice(0, 64);
  const med = String(attribution.utm_medium || '').trim();
  if (med) return med.length <= 64 ? med : med.slice(0, 64);
  return 'direct';
}
