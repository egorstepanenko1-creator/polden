/** Единообразный вывод денег и дат для CRM (ru-RU). */

export function rubKopeks(k) {
  return `${(Number(k || 0) / 100).toLocaleString('ru-RU')} ₽`;
}

export function rubKopeksMax2(k) {
  return `${(Number(k || 0) / 100).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ₽`;
}

/** @param {string | null | undefined} iso */
export function fmtDateTimeShort(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' });
}
