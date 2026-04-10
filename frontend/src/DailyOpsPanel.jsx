import { rubKopeks } from './i18n/format.js';

const STATUS_LABEL = {
  NEW: 'Новый',
  CONFIRMED: 'Принято',
  KITCHEN: 'Кухня',
  DELIVERING: 'Доставка',
  DONE: 'Завершён',
  CANCELED: 'Отменён'
};

const STATUS_DOT = {
  NEW:        '#1565c0',
  CONFIRMED:  '#2e7d32',
  KITCHEN:    '#ef6c00',
  DELIVERING: '#6a1b9a',
  DONE:       '#37474f',
  CANCELED:   '#c62828'
};

/**
 * @param {{
 *   primary: object,
 *   loading: boolean,
 *   err: string,
 *   onPatchStatus?: (orderId: string, status: string) => void
 * }} props
 */
export function DailyOpsPanel({ primary, loading, err, onPatchStatus, orders }) {
  if (err) {
    return (
      <section style={{ marginBottom: 16 }} aria-live="polite">
        <div style={{ color: '#b00020', padding: 10, border: '1px solid #ffcdd2', borderRadius: 10, fontSize: 13 }}>
          {err}
        </div>
      </section>
    );
  }

  if (loading && !primary) {
    return (
      <section style={{ marginBottom: 16 }}>
        <p style={{ margin: 0, color: '#999', fontSize: 13 }}>Загрузка сводки…</p>
      </section>
    );
  }

  if (!primary) return null;

  const p = primary;

  // kitchen summary: join with menu names if available (via topPositions)
  const kitchenRows = p.topPositions || [];

  return (
    <section
      style={{
        marginBottom: 20,
        border: '1px solid #c8e6c9',
        borderRadius: 14,
        padding: '14px 16px',
        background: 'linear-gradient(180deg,#f1f8f4 0%,#fff 56px)'
      }}
      aria-labelledby="daily-ops-heading"
    >
      {/* Шапка */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
        <h2 id="daily-ops-heading" style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>
          На {p.deliveryDate}
        </h2>
        {loading ? <span style={{ fontSize: 12, color: '#999' }}>…</span> : null}
      </div>

      {/* Ключевые цифры */}
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 28, fontWeight: 800, lineHeight: 1 }}>{p.totalOrders}</div>
          <div style={{ fontSize: 12, color: '#666', marginTop: 3 }}>заказов</div>
        </div>
        <div>
          <div style={{ fontSize: 28, fontWeight: 800, lineHeight: 1 }}>{rubKopeks(p.totalRevenueKopeks)}</div>
          <div style={{ fontSize: 12, color: '#666', marginTop: 3 }}>выручка</div>
        </div>
        <div>
          <div style={{ fontSize: 28, fontWeight: 800, lineHeight: 1 }}>{rubKopeks(p.averageOrderValueKopeks)}</div>
          <div style={{ fontSize: 12, color: '#666', marginTop: 3 }}>средний чек</div>
        </div>
      </div>

      {/* Статусы — компактная строка */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 14, fontSize: 13 }}>
        {Object.entries(p.byStatus || {})
          .filter(([, cnt]) => cnt > 0)
          .map(([status, cnt]) => (
            <span key={status} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{
                width: 8, height: 8, borderRadius: '50%',
                background: STATUS_DOT[status] || '#999', display: 'inline-block'
              }} />
              {STATUS_LABEL[status] || status}: <strong>{cnt}</strong>
            </span>
          ))}
      </div>

      {/* Внимание */}
      {p.attention?.length > 0 ? (
        <div style={{ marginBottom: 14 }}>
          {p.attention.map((a) => (
            <div key={a.code} style={{
              fontSize: 13, padding: '6px 10px', borderRadius: 8,
              background: a.severity === 'warn' ? '#fff3e0' : '#e3f2fd',
              color: a.severity === 'warn' ? '#e65100' : '#1565c0', marginBottom: 4
            }}>
              ⚠ {a.message}
            </div>
          ))}
        </div>
      ) : null}

      {/* Кухня — что готовить */}
      {kitchenRows.length > 0 ? (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
            Кухня · {p.deliveryDate}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', fontSize: 13 }}>
            {kitchenRows.map((row) => (
              <span key={row.position}>
                <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{row.position}</strong>
                <span style={{ color: '#888' }}> — </span>
                {row.totalQty} шт.
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {/* Последние заказы — с кнопкой Принято */}
      {(orders?.length > 0 || p.latestOrders?.length > 0) ? (
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
            Последние заказы
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {(orders || p.latestOrders || []).map((o) => {
              const isNew = o.status === 'NEW';
              return (
                <div key={o.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                  padding: '6px 8px', borderRadius: 8,
                  background: isNew ? '#e3f2fd' : '#f5f5f5'
                }}>
                  <span style={{
                    width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                    background: STATUS_DOT[o.status] || '#999'
                  }} />
                  <span style={{ fontWeight: 600, fontSize: 13, flex: '1 1 120px' }}>{o.customerName}</span>
                  {Array.isArray(o.items) && o.items.length > 0 ? (
                    <span style={{ fontSize: 12, color: '#888', fontFamily: 'monospace' }}>
                      {o.items.map((i) => i.position).join('')}
                    </span>
                  ) : null}
                  <span style={{ fontSize: 12, color: '#888' }}>{rubKopeks(o.totalAmount)}</span>
                  {isNew && onPatchStatus ? (
                    <button
                      type="button"
                      onClick={() => onPatchStatus(o.id, 'CONFIRMED')}
                      style={{
                        padding: '3px 12px', fontSize: 12, fontWeight: 700,
                        background: '#2e7d32', color: '#fff',
                        border: 'none', borderRadius: 6, cursor: 'pointer'
                      }}
                    >
                      Принято ✓
                    </button>
                  ) : (
                    <span style={{ fontSize: 12, color: STATUS_DOT[o.status] || '#999', fontWeight: 600 }}>
                      {STATUS_LABEL[o.status] || o.status}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </section>
  );
}
