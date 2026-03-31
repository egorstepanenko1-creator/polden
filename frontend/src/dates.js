/** Локальный календарный YYYY-MM-DD */
export function localDateISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function localTodayISO() {
  return localDateISO(new Date());
}

export function localTomorrowISO() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return localDateISO(d);
}
