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

export function formatDateDots(iso) {
  if (!iso) return "";
  const [y, m, d] = String(iso).split("-");
  return (d || "") + "." + (m || "") + "." + (y || "");
}

export function formatDateRuLong(iso) {
  if (!iso) return "";
  const months = ["января","февраля","марта","апреля","мая","июня","июля","августа","сентября","октября","ноября","декабря"];
  const [y, m, d] = String(iso).split("-");
  return parseInt(d, 10) + " " + (months[parseInt(m, 10) - 1] || m) + " " + y;
}

export function localYesterdayISO() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return localDateISO(d);
}
