/**
 * Компактный ввод позиций заказа для оператора: «1x2 3x1», «1×2, 3*1», «7:2».
 * Позиции 1–10, количество 1–99; повтор позиции суммируется (с потолком 99).
 */

const TOKEN_RE = /^(\d{1,2})\s*[x×*:\u00d7]\s*(\d{1,2})$/i;
const SLASH_RE = /^(\d{1,2})\/(\d{1,2})$/;

/**
 * @param {string} text
 * @returns {{ ok: true, items: Array<{ position: number, qty: number }> } | { ok: false, error: string }}
 */
export function parseCompactOrderItems(text) {
  const raw = String(text || '').trim();
  if (!raw) return { ok: true, items: [] };
  const tokens = raw.split(/[\s,;]+/).filter(Boolean);
  /** @type {Map<number, number>} */
  const byPos = new Map();
  for (const tok of tokens) {
    const m = tok.match(TOKEN_RE) || tok.match(SLASH_RE);
    if (!m) {
      return {
        ok: false,
        error: `Не разобрать «${tok}». Формат: позиция×кол-во, через пробел (напр. 1x2 3x1 5x1)`
      };
    }
    const pos = Number(m[1]);
    const qty = Number(m[2]);
    if (pos < 1 || pos > 10) {
      return { ok: false, error: `Позиция ${pos} вне диапазона 1–10` };
    }
    if (qty < 1 || qty > 99) {
      return { ok: false, error: `Количество для поз. ${pos}: допустимо 1–99` };
    }
    byPos.set(pos, Math.min(99, (byPos.get(pos) || 0) + qty));
  }
  const items = [...byPos.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([position, qty]) => ({ position, qty }));
  return { ok: true, items };
}
