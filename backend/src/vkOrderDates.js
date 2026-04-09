/**
 * Дата «завтра» по Екатеринбургу (UTC+5).
 * Не зависит от TZ сервера — всегда считает по Екб.
 */

function nowEkb() {
  return new Date(Date.now() + 5 * 3600000);
}

export function serverLocalTomorrowISO() {
  const d = nowEkb();
  d.setDate(d.getDate() + 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Проверка: завтра — выходной (сб/вс по Екб)? */
export function isTomorrowWeekendEkb() {
  const d = nowEkb();
  d.setDate(d.getDate() + 1);
  const dow = d.getDay();
  return dow === 0 || dow === 6;
}

/**
 * Форматирует YYYY-MM-DD как "10.04 (чт)".
 * @param {string} iso
 */
export function formatDateWithDow(iso) {
  const DOW_RU = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
  const d = new Date(iso + 'T00:00:00');
  const dow = DOW_RU[d.getDay()];
  const [, m, day] = iso.split('-');
  return `${day}.${m} (${dow})`;
}
