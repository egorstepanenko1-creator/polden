/**
 * Парсинг строки корзины VK: только явные пары позиция×количество.
 * Форматы (можно смешивать через запятую/точку с запятой/перенос):
 * - 1x2  3х1  (латинская x или кириллическая х/×)
 * - 1 2, 3 1  (позиция и qty через пробел)
 */

const SEG_SPLIT = /[,;\n]+/;

/**
 * @param {string} raw
 * @returns {{ ok: true, items: Array<{ position: number, qty: number }> } | { ok: false, error: string }}
 */
export function parseVkCartLine(raw) {
  const text = String(raw || '').trim();
  if (!text) return { ok: false, error: 'Пустая строка' };

  const segments = text
    .split(SEG_SPLIT)
    .map((s) => s.trim())
    .filter(Boolean);
  if (segments.length === 0) return { ok: false, error: 'Нет сегментов' };

  /** @type {Map<number, number>} */
  const byPos = new Map();

  for (const seg of segments) {
    const xMatch = seg.match(/^(\d{1,2})\s*[xх×]\s*(\d{1,2})$/i);
    const spMatch = !xMatch && seg.match(/^(\d{1,2})\s+(\d{1,2})$/);
    const m = xMatch || spMatch;
    if (!m) {
      return {
        ok: false,
        error: `Не разобрал фрагмент «${seg}». Примеры: 1x2, 3х1, 5 1`
      };
    }
    const position = Number(m[1]);
    const qty = Number(m[2]);
    if (position < 1 || position > 10) {
      return { ok: false, error: `Позиция ${position} вне диапазона 1–10` };
    }
    if (qty < 1 || qty > 99) {
      return { ok: false, error: `Количество для поз. ${position}: нужно 1–99` };
    }
    byPos.set(position, (byPos.get(position) || 0) + qty);
  }

  const items = [...byPos.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([position, qty]) => ({ position, qty }));

  return { ok: true, items };
}
