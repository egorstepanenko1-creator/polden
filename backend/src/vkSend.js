/**
 * Минимальная отправка сообщений VK messages.send (Callback API / бот).
 */

const VK_API = 'https://api.vk.com/method/messages.send';

/**
 * Клавиатура: Меню | Заявка | Оператор
 */
export function vkMainKeyboardJson() {
  return JSON.stringify({
    one_time: false,
    inline: false,
    buttons: [
      [
        { action: { type: 'text', label: 'Меню', payload: '{}' }, color: 'secondary' },
        { action: { type: 'text', label: 'Оформить заказ', payload: '{}' }, color: 'primary' }
      ],
      [
        { action: { type: 'text', label: 'Оставить заявку', payload: '{}' }, color: 'secondary' },
        { action: { type: 'text', label: 'Связаться с оператором', payload: '{}' }, color: 'secondary' }
      ]
    ]
  });
}

/**
 * @param {number|string} peerId
 * @param {string} text
 * @param {{ keyboardJson?: string | null }} [opts]
 */
export async function vkSendMessage(peerId, text, opts = {}) {
  const token = (process.env.VK_GROUP_ACCESS_TOKEN || '').trim();
  if (!token) {
    console.warn('[vk] VK_GROUP_ACCESS_TOKEN not set, skip send');
    return { ok: false, skipped: true };
  }
  const params = new URLSearchParams({
    peer_id: String(peerId),
    message: text.slice(0, 4096),
    random_id: String(Math.floor(Math.random() * 2_147_483_647)),
    access_token: token,
    v: '5.131'
  });
  if (opts.keyboardJson) {
    params.set('keyboard', opts.keyboardJson);
  }
  const r = await fetch(VK_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString()
  });
  const j = await r.json().catch(() => null);
  if (!r.ok || j?.error) {
    console.error('[vk] messages.send failed', r.status, j);
    return { ok: false, error: j?.error || r.status };
  }
  return { ok: true, response: j?.response };
}
