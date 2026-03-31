/**
 * Безопасный разбор даты из текста лида VK.
 * Поддерживается только YYYY-MM-DD и DD.MM.YYYY / DD/MM/YYYY (1–2 цифры день/месяц).
 * Иначе — не угадываем, возвращаем unresolvedLabel.
 */

/**
 * @param {string} text
 * @returns {{ iso: string | null, unresolvedLabel: string }}
 */
export function parseLeadDeliveryDate(text) {
  const raw = String(text || '').trim();
  if (!raw) return { iso: null, unresolvedLabel: '' };

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return { iso: raw, unresolvedLabel: '' };
  }

  const m = raw.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  if (m) {
    const dd = m[1].padStart(2, '0');
    const mm = m[2].padStart(2, '0');
    const y = m[3];
    return { iso: `${y}-${mm}-${dd}`, unresolvedLabel: '' };
  }

  return { iso: null, unresolvedLabel: raw };
}
