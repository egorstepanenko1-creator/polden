import { rubKopeks } from './i18n/format.js';

const SOURCE_KEYS = ['SITE', 'VK', 'MANUAL', 'PHONE'];
const SOURCE_LABEL = { SITE: 'Сайт', VK: 'VK', MANUAL: 'Вручную', PHONE: 'Телефон' };

const STATUS_KEYS = ['NEW', 'CONFIRMED', 'KITCHEN', 'DELIVERING', 'DONE', 'CANCELED'];
const STATUS_LABEL = {
  NEW: 'Новый',
  CONFIRMED: 'Подтверждён',
  KITCHEN: 'Кухня',
  DELIVERING: 'Доставка',
  DONE: 'Завершён',
  CANCELED: 'Отменён'
};

const STATUS_BAR_COLOR = {
  NEW: '#1565c0',
  CONFIRMED: '#2e7d32',
  KITCHEN: '#ef6c00',
  DELIVERING: '#6a1b9a',
  DONE: '#37474f',
  CANCELED: '#c62828'
};

function deltaNum(n) {
  if (n === 0) return '±0';
  return n > 0 ? `+${n}` : String(n);
}

function deltaRub(k) {
  if (k === 0) return '±0';
  const sign = k > 0 ? '+' : '−';
  const abs = Math.abs(k);
  const rub = (abs / 100).toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  return `${sign}${rub} ₽`;
}

function miniCardStyle() {
  return {
    border: '1px solid #e0e0e0',
    borderRadius: 10,
    padding: '12px 14px',
    background: '#fff',
    minWidth: 0
  };
}

/** @param {{ label: string, value: string, sub?: string, warn?: boolean }} p */
function StatCard({ label, value, sub, warn }) {
  return (
    <div style={{ ...miniCardStyle(), borderColor: warn ? '#ffcdd2' : '#e0e0e0' }}>
      <div style={{ fontSize: 11, color: '#666', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4, lineHeight: 1.15 }}>{value}</div>
      {sub ? <div style={{ fontSize: 12, color: '#888', marginTop: 6 }}>{sub}</div> : null}
    </div>
  );
}

/** @param {{ total: number, counts: Record<string, number>, keys: string[], labels: Record<string, string>, colors?: Record<string, string> }} p */
function MixBars({ total, counts, keys, labels, colors }) {
  const t = Math.max(1, total);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {keys.map((k) => {
        const c = counts[k] || 0;
        const pct = Math.round((c / t) * 1000) / 10;
        const bg = colors?.[k] || '#90a4ae';
        return (
          <div key={k}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
              <span>{labels[k] || k}</span>
              <span style={{ fontWeight: 600 }}>
                {c}
                <span style={{ color: '#888', fontWeight: 400 }}> ({pct}%)</span>
              </span>
            </div>
            <div style={{ height: 8, borderRadius: 4, background: '#eee', overflow: 'hidden' }}>
              <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', background: bg, transition: 'width 0.2s' }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * @param {{
 *   primary: object,
 *   compare: object | null,
 *   deltas: object | null,
 *   compareDateLabel: string | null,
 *   loading: boolean,
 *   err: string
 * }} props
 */
export function DailyOpsPanel({ primary, compare, deltas, compareDateLabel, loading, err }) {
  if (err) {
    return (
      <section style={{ marginBottom: 20 }} aria-live="polite">
        <div style={{ color: '#b00020', padding: 12, border: '1px solid #ffcdd2', borderRadius: 10 }} role="alert">
          {err}
        </div>
      </section>
    );
  }

  if (loading && !primary) {
    return (
      <section style={{ marginBottom: 20 }}>
        <p style={{ margin: 0, color: '#666', fontSize: 14 }}>Загрузка операционной сводки…</p>
      </section>
    );
  }

  if (!primary) return null;

  const p = primary;
  const hasCompare = Boolean(compare && deltas);

  const ordersSub = hasCompare
    ? `к дате ${compareDateLabel}: ${deltaNum(deltas.totalOrders)} заказ.`
    : null;
  const revSub = hasCompare ? `Δ выручки: ${deltaRub(deltas.totalRevenueKopeks)}` : 'сумма totalAmount';
  const aovSub = hasCompare ? `Δ среднего чека: ${deltaRub(deltas.averageOrderValueKopeks)}` : 'выручка / заказы';

  return (
    <section
      style={{
        marginBottom: 20,
        border: '1px solid #c8e6c9',
        borderRadius: 14,
        padding: '14px 16px 18px',
        background: 'linear-gradient(180deg, #f1f8f4 0%, #fff 48px)'
      }}
      aria-labelledby="daily-ops-heading"
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <h2 id="daily-ops-heading" style={{ margin: 0, fontSize: '1.15rem' }}>
          Операции на {p.deliveryDate}
        </h2>
        {loading ? <span style={{ fontSize: 13, color: '#666' }}>Обновление…</span> : null}
      </div>
      {hasCompare ? (
        <p style={{ margin: '6px 0 14px', fontSize: 13, color: '#555' }}>
          Сравнение с датой доставки <strong>{compare.deliveryDate}</strong> (дельты — выбранная минус соседняя).
        </p>
      ) : (
        <p style={{ margin: '6px 0 14px', fontSize: 13, color: '#666' }}>
          Заказы с датой доставки на выбранный день. Переключите «Сегодня / Завтра» для сравнения.
        </p>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
          gap: 10,
          marginBottom: 16
        }}
      >
        <StatCard
          label="Заказы"
          value={String(p.totalOrders)}
          sub={ordersSub}
          warn={p.totalOrders === 0}
        />
        <StatCard label="Выручка" value={rubKopeks(p.totalRevenueKopeks)} sub={revSub} />
        <StatCard label="Средний чек" value={rubKopeks(p.averageOrderValueKopeks)} sub={aovSub} />
      </div>

      {p.attention?.length > 0 ? (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: '#555', marginBottom: 8 }}>
            Внимание
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14 }}>
            {p.attention.map((a) => (
              <li
                key={a.code}
                style={{
                  marginBottom: 6,
                  color: a.severity === 'warn' ? '#b71c1c' : '#1565c0'
                }}
              >
                {a.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: 14,
          marginBottom: 14
        }}
      >
        <div style={miniCardStyle()}>
          <strong style={{ fontSize: 14 }}>Каналы</strong>
          <MixBars total={p.totalOrders} counts={p.bySource} keys={SOURCE_KEYS} labels={SOURCE_LABEL} />
          {hasCompare ? (
            <div style={{ marginTop: 12, fontSize: 12, color: '#666', borderTop: '1px solid #eee', paddingTop: 8 }}>
              Δ по каналам (к {compare.deliveryDate}):{' '}
              {SOURCE_KEYS.map((k) => `${SOURCE_LABEL[k]} ${deltaNum(deltas.bySource[k] || 0)}`).join(' · ')}
            </div>
          ) : null}
        </div>
        <div style={miniCardStyle()}>
          <strong style={{ fontSize: 14 }}>Статусы</strong>
          <MixBars
            total={p.totalOrders}
            counts={p.byStatus}
            keys={STATUS_KEYS}
            labels={STATUS_LABEL}
            colors={STATUS_BAR_COLOR}
          />
        </div>
      </div>

      {p.topPositions?.length > 0 ? (
        <div style={{ ...miniCardStyle(), marginBottom: 12 }}>
          <strong style={{ fontSize: 14 }}>Топ позиций меню (слот × кол-во)</strong>
          <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 13, columns: 2, columnGap: 16 }}>
            {p.topPositions.map((row) => (
              <li key={row.position} style={{ breakInside: 'avoid' }}>
                Слот {row.position}: {row.totalQty} шт.
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {p.latestOrders?.length > 0 ? (
        <div style={miniCardStyle()}>
          <strong style={{ fontSize: 14 }}>Последние заказы</strong>
          <ul style={{ margin: '8px 0 0', paddingLeft: 0, listStyle: 'none', fontSize: 13 }}>
            {p.latestOrders.map((o) => (
              <li
                key={o.id}
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '4px 10px',
                  padding: '6px 0',
                  borderBottom: '1px solid #f0f0f0'
                }}
              >
                <span style={{ fontWeight: 600 }}>{o.customerName}</span>
                <span style={{ color: '#666' }}>{STATUS_LABEL[o.status] || o.status}</span>
                <span style={{ color: '#666' }}>{SOURCE_LABEL[o.sourceChannel] || o.sourceChannel}</span>
                <span>{rubKopeks(o.totalAmount)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
