import { orderStatusLabel, orderSourceChannelLabel } from './i18n/ru.js';
import { rubKopeks } from './i18n/format.js';
import { getAllowedNextStatuses, getLinearNextStatus } from './operatorStatusHelpers.js';

function formatAttributionHint(attribution) {
  if (!attribution || typeof attribution !== 'object') return null;
  const parts = [];
  if (attribution.utm_source) parts.push(String(attribution.utm_source));
  if (attribution.utm_campaign && String(attribution.utm_campaign) !== String(attribution.utm_source)) {
    parts.push(String(attribution.utm_campaign));
  }
  if (parts.length === 0 && attribution.landing_path) parts.push(String(attribution.landing_path).slice(0, 80));
  return parts.length ? parts.join(' · ') : null;
}

/** Лёгкая трассировка VK в атрибуции заказа (не дублировать сырой JSON). */
function formatVkTraceLine(attribution) {
  if (!attribution || typeof attribution !== 'object') return null;
  const cap = (s, n) => (String(s || '').length <= n ? String(s || '') : `${String(s).slice(0, n)}…`);
  const peer = attribution.vk_peer_id;
  const user = attribution.vk_user_id;
  const capType = attribution.order_capture;
  if (!peer && !user && !capType) return null;
  const bits = [];
  if (capType) bits.push(String(capType));
  if (peer) bits.push(`peer ${cap(peer, 18)}`);
  if (user) bits.push(`user ${cap(user, 14)}`);
  return bits.join(' · ');
}

const btnBase = {
  minHeight: 44,
  minWidth: 44,
  padding: '10px 12px',
  fontSize: 14,
  fontWeight: 600,
  borderRadius: 10,
  border: '1px solid #ccc',
  background: '#fff',
  cursor: 'pointer'
};

const primaryBtn = {
  ...btnBase,
  background: '#1565c0',
  color: '#fff',
  borderColor: '#1565c0'
};

/**
 * @param {{
 *   order: object,
 *   selected: boolean,
 *   onSelect: () => void,
 *   statusUpdating: boolean,
 *   onPatchStatus: (status: string) => Promise<void>,
 * }} props
 */
export function OperatorOrderCard({ order, selected, onSelect, statusUpdating, onPatchStatus }) {
  const o = order;
  const attribHint = formatAttributionHint(o.attribution);
  const vkTrace = o.sourceChannel === 'VK' ? formatVkTraceLine(o.attribution) : null;
  const phoneDigits = String(o.customerPhone || '').replace(/\D/g, '');
  let telDigits = phoneDigits;
  if (telDigits.startsWith('8')) telDigits = `7${telDigits.slice(1)}`;
  if (telDigits && !telDigits.startsWith('7')) telDigits = `7${telDigits}`;
  const telHref = telDigits.length >= 11 ? `tel:+${telDigits}` : phoneDigits ? `tel:${o.customerPhone.replace(/\s/g, '')}` : null;

  async function copyText(label, text) {
    const t = String(text || '').trim();
    if (!t) return;
    try {
      await navigator.clipboard.writeText(t);
    } catch {
      window.prompt(`Скопируйте ${label}`, t);
    }
  }

  const linearNext = getLinearNextStatus(o.status || 'NEW');
  const allowed = getAllowedNextStatuses(o.status || 'NEW');
  const canLinear = linearNext && allowed.includes(linearNext);

  const itemSummary = Array.isArray(o.items)
    ? o.items.map((i) => `${i.position}×${i.qty}`).join(', ')
    : '—';

  return (
    <article
      style={{
        border: selected ? '2px solid #1565c0' : '1px solid #ddd',
        borderRadius: 12,
        padding: 12,
        background: selected ? '#f3f8ff' : '#fff',
        marginBottom: 10
      }}
    >
      <button
        type="button"
        onClick={onSelect}
        style={{
          width: '100%',
          textAlign: 'left',
          background: 'transparent',
          border: 'none',
          padding: 0,
          cursor: 'pointer'
        }}
      >
        <div style={{ fontSize: 12, color: '#666', wordBreak: 'break-all' }}>
          <strong>ID</strong> <code style={{ fontSize: 11 }}>{o.id}</code>
        </div>
        <div style={{ fontSize: 17, fontWeight: 700, marginTop: 4 }}>{o.customerName}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 12, padding: '4px 10px', borderRadius: 999, background: '#e3f2fd', fontWeight: 600 }}>
            {orderStatusLabel(o.status || 'NEW')}
          </span>
          <span
            style={{
              fontSize: 12,
              padding: '4px 10px',
              borderRadius: 999,
              background: o.sourceChannel === 'VK' ? '#ede7f6' : '#f3e5f5',
              fontWeight: 700,
              color: o.sourceChannel === 'VK' ? '#4527a0' : '#333'
            }}
          >
            {orderSourceChannelLabel(o.sourceChannel || 'SITE')}
            {o.sourceChannel === 'VK' ? ' · заказ' : ''}
          </span>
        </div>
        {o.vkLeadId ? (
          <div style={{ fontSize: 12, color: '#4527a0', marginTop: 6, fontWeight: 600 }}>
            Связь с лидом VK: <code style={{ fontSize: 11 }}>{o.vkLeadId}</code>
          </div>
        ) : o.sourceChannel === 'VK' ? (
          <div style={{ fontSize: 12, color: '#4527a0', marginTop: 6, fontWeight: 600 }}>
            Заказ из VK-бота (прямой сценарий)
          </div>
        ) : null}
        {vkTrace ? (
          <div style={{ fontSize: 11, color: '#5e35b1', marginTop: 4 }} title="Трассировка для поддержки">
            VK: {vkTrace}
          </div>
        ) : null}
        <div style={{ fontSize: 15, marginTop: 8 }}>📞 {o.customerPhone}</div>
        {o.address ? (
          <div style={{ fontSize: 14, color: '#444', marginTop: 4 }}>📍 {o.address}</div>
        ) : null}
        {o.comment ? (
          <div
            style={{
              fontSize: 14,
              marginTop: 8,
              padding: 8,
              background: '#fff8e1',
              borderRadius: 8,
              fontWeight: 500
            }}
          >
            💬 {o.comment}
          </div>
        ) : null}
        <div style={{ fontSize: 14, marginTop: 8, color: '#333' }}>
          {o.itemsSubtotalKopeks != null && o.deliveryFeeKopeks != null ? (
            <div style={{ lineHeight: 1.45 }}>
              <div>
                Позиции: <strong>{rubKopeks(o.itemsSubtotalKopeks)}</strong>
              </div>
              <div style={{ fontSize: 13, color: '#555' }}>
                Доставка:{' '}
                {o.deliveryFeeKopeks > 0 ? rubKopeks(o.deliveryFeeKopeks) : 'бесплатно'}
              </div>
              <div>
                Итого: <strong>{rubKopeks(o.totalAmount)}</strong>
              </div>
            </div>
          ) : (
            <strong>{rubKopeks(o.totalAmount)}</strong>
          )}
          <span style={{ color: '#666', marginLeft: 8 }}>· {itemSummary}</span>
        </div>
        <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>Доставка: {o.deliveryDate}</div>
        {attribHint ? (
          <div style={{ fontSize: 11, color: '#5a7a66', marginTop: 6 }}>Атриб.: {attribHint}</div>
        ) : null}
      </button>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12, paddingTop: 12, borderTop: '1px solid #eee' }}>
        {telHref ? (
          <a href={telHref} style={{ ...primaryBtn, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
            Позвонить
          </a>
        ) : null}
        <button type="button" style={btnBase} onClick={() => copyText('телефон', o.customerPhone)}>
          Копир. тел.
        </button>
        {o.address ? (
          <button type="button" style={btnBase} onClick={() => copyText('адрес', o.address)}>
            Копир. адрес
          </button>
        ) : null}
      </div>

      <div style={{ marginTop: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 6 }}>Статус</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {canLinear ? (
            <button
              type="button"
              disabled={statusUpdating}
              style={{ ...primaryBtn, flex: '1 1 140px' }}
              onClick={(e) => {
                e.stopPropagation();
                if (linearNext) void onPatchStatus(linearNext);
              }}
            >
              {statusUpdating ? '…' : `→ ${orderStatusLabel(linearNext)}`}
            </button>
          ) : null}
          {allowed
            .filter((s) => s !== linearNext)
            .map((s) => (
              <button
                key={s}
                type="button"
                disabled={statusUpdating}
                style={{
                  ...btnBase,
                  ...(s === 'CANCELED' ? { borderColor: '#c62828', color: '#c62828' } : {})
                }}
                onClick={(ev) => {
                  ev.stopPropagation();
                  void onPatchStatus(s);
                }}
              >
                {orderStatusLabel(s)}
              </button>
            ))}
        </div>
      </div>
    </article>
  );
}
