/**
 * Дата «завтра» для VK-заказа: тот же календарный сдвиг, что и у `frontend/src/dates.js` (локальное время процесса Node).
 * В проде держите TZ сервера согласованным с публичным сайтом (например Europe/Moscow).
 */

export function serverLocalTomorrowISO() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
