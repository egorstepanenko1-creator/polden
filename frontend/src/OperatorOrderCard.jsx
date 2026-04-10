import { orderStatusLabel, orderSourceChannelLabel } from './i18n/ru.js';
import { rubKopeks } from './i18n/format.js';
import { getAllowedNextStatuses, getLinearNextStatus } from './operatorStatusHelpers.js';

const btnBase = {
  minHeight: 44,
  minWidth: 44,
  padding: '10px 14px',
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

const STATUS_COLORS = {
  NEW:        { bg: '#e3f2fd', color: '#1565c0' },
  CONFIRMED:  { bg: '#e8f5e9', color: '#2e7d32' },
  KITCHEN:    { bg: '#fff3e0', color: '#e65100' },
  DELIVERING: { bg: '#f3e5f5', color: '#6a1b9a' },
  DONE:       { bg: '#eceff1', color: '#37474f' },
  CANCELED:   { bg: '#ffebee', color: '#c62828' },
};

/**
 * @param {{
 *   order: object,
 *   menuItems?: Array<{position: number, name: string}>,
 *   selected: boolean,
 *   onSelect: () => void,
 *   statusUpdating: boolean,
 *   onPatchStatus: (status: string) => Promise<void>,
 * }} props
 */
export function OperatorOrderCard({ order, menuItems, selected, onSelect, statusUpdating, onPatchStatus }) {
  const o = order;

  // Build position→name map from today's menu
  const menuMap = {};
  if (Array.isArray(menuItems)) {
    menuItems.forEach((m) => { menuMap[m.position] = m.name; });
  }

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

  const statusStyle = STATUS_COLORS[o.status] || STATUS_COLORS.NEW;

  // Render items: name if menu available, else position
  const itemLines = Array.isArray(o.items)
    ? o.items.map((i) => {
        const name = menuMap[i.position] || `Позиция ${i.position}`;
        return i.qty > 1 ? `${i.qty}× ${name}` : name;
      })
    : [];

  const isVk = o.sourceChannel === 'VK';
  const channelLabel = isVk ? '🤖 VK-бот' : orderSourceChannelLabel(o.sourceChannel || 'SITE');

  return (
    <article
      style={{
        border: selected ? '2px solid #1565c0' : '1px solid #e0e0e0',
        borderRadius: 12,
        padding: '12px 14px',
        background: selected ? '#f0f6ff' : '#fff',
        marginBottom: 10,
        boxShadow: selected ? '0 2px 8px rgba(21,101,192,0.1)' : 'none'
      }}
    >
      {/* Клик по карточке — раскрыть */}
      <button
        type="button"
        onClick={onSelect}
        style={{ width: '100%', textAlign: 'left', background: 'transparent', border: 'none', padding: 0, cursor: 'pointer' }}
      >
        {/* Строка 1: имя + статус */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 17, fontWeight: 700, color: '#111' }}>{o.customerName}</span>
          <span style={{
            fontSize: 12, padding: '3px 10px', borderRadius: 999,
            background: statusStyle.bg, color: statusStyle.color, fontWeight: 700
          }}>
            {orderStatusLabel(o.status || 'NEW')}
          </span>
          <span style={{ fontSize: 12, color: '#888' }}>{channelLabel} · {o.deliveryDate}</span>
        </div>

        {/* Строка 2: телефон + адрес */}
        <div style={{ marginTop: 8, fontSize: 14, color: '#333' }}>
          📞 {o.customerPhone}
        </div>
        {o.address ? (
          <div style={{ fontSize: 14, color: '#555', marginTop: 3 }}>📍 {o.address}</div>
        ) : null}

        {/* Комментарий */}
        {o.comment ? (
          <div style={{ fontSize: 13, marginTop: 8, padding: '6px 10px', background: '#fff8e1', borderRadius: 8, fontWeight: 500 }}>
            💬 {o.comment}
          </div>
        ) : null}

        {/* Блюда */}
        {itemLines.length > 0 ? (
          <ul style={{ margin: '8px 0 0', padding: '0 0 0 4px', listStyle: 'none', fontSize: 13, color: '#444', lineHeight: 1.7 }}>
            {itemLines.map((line, i) => (
              <li key={i}>• {line}</li>
            ))}
          </ul>
        ) : null}

        {/* Сумма */}
        <div style={{ marginTop: 8, fontWeight: 700, fontSize: 15, color: '#111' }}>
          {rubKopeks(o.totalAmount)}
        </div>
      </button>

      {/* Действия */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12, paddingTop: 12, borderTop: '1px solid #eee' }}>
        {telHref ? (
          <a href={telHref} style={{ ...primaryBtn, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
            📞 Позвонить
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

      {/* Смена статуса */}
      <div style={{ marginTop: 10 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {canLinear ? (
            <button
              type="button"
              disabled={statusUpdating}
              style={{ ...primaryBtn, flex: '1 1 140px' }}
              onClick={(e) => { e.stopPropagation(); if (linearNext) void onPatchStatus(linearNext); }}
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
                style={{ ...btnBase, ...(s === 'CANCELED' ? { borderColor: '#c62828', color: '#c62828' } : {}) }}
                onClick={(ev) => { ev.stopPropagation(); void onPatchStatus(s); }}
              >
                {orderStatusLabel(s)}
              </button>
            ))}
        </div>
      </div>
    </article>
  );
}
