import { useEffect, useState } from 'react';

const TOKEN = import.meta.env.VITE_CRM_TOKEN || 'dev';

async function apiFetch(path, opts = {}) {
  const res = await fetch(path, {
    method: opts.method || 'GET',
    headers: {
      Accept: 'application/json',
      'X-CRM-Token': TOKEN,
      ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {})
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) throw new Error(json?.error?.message || `HTTP ${res.status}`);
  return json.data;
}

/** 2026-04-10 → 10.04.2026 */
function fmtDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

function fmtRub(kopeks) {
  if (!kopeks && kopeks !== 0) return '—';
  return Math.round(kopeks / 100).toLocaleString('ru-RU') + ' ₽';
}

const TAG = {
  active:   { label: 'Активный',      color: '#2e7d32', bg: '#e8f5e9' },
  regular:  { label: 'Постоянный',    color: '#1565c0', bg: '#e3f2fd' },
  sleeping: { label: 'Давно не было', color: '#b71c1c', bg: '#ffebee' }
};

const SRC_LABEL = { VK: 'VK', MANUAL: 'Ручной', PHONE: 'Телефон', SITE: 'Сайт' };

export function ClientsPage({ branchId = '' }) {
  const [clients, setClients] = useState([]);
  const [total, setTotal]     = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr]         = useState('');
  const [filter, setFilter]   = useState('all');
  const [search, setSearch]   = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null); // phone to confirm

  function load() {
    setLoading(true);
    setErr('');
    const q = branchId ? `?branchId=${encodeURIComponent(branchId)}` : '';
    apiFetch(`/api/client-stats${q}`)
      .then((d) => { setClients(Array.isArray(d.clients) ? d.clients : []); setTotal(d.total ?? 0); })
      .catch((e) => setErr(e.message || String(e)))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, [branchId]);

  async function deleteClient(phone) {
    try {
      await apiFetch(`/api/client-stats/${encodeURIComponent(phone)}`, { method: 'DELETE' });
      setClients(prev => prev.filter(c => c.phone !== phone));
      setTotal(prev => prev - 1);
    } catch (e) {
      setErr(e.message || String(e));
    } finally {
      setConfirmDelete(null);
    }
  }

  const displayed = clients.filter((c) => {
    if (filter === 'repeat'   && c.orderCount < 2)       return false;
    if (filter === 'remind'   && !c.needRemind)          return false;
    if (filter === 'sleeping' && c.tag !== 'sleeping')   return false;
    if (filter === 'active'   && c.tag !== 'active')     return false;
    if (search) {
      const q = search.toLowerCase();
      return c.name.toLowerCase().includes(q) || c.phone.includes(q);
    }
    return true;
  });

  const repeatCount  = clients.filter(c => c.orderCount >= 2).length;
  const remindCount  = clients.filter(c => c.needRemind).length;
  const sleepCount   = clients.filter(c => c.tag === 'sleeping').length;
  const activeCount  = clients.filter(c => c.tag === 'active').length;

  const pills = [
    { id: 'all',     label: 'Все',             count: total,       color: '#333' },
    { id: 'repeat',  label: 'Повторные',        count: repeatCount, color: '#1565c0' },
    { id: 'remind',  label: '🔔 Напомнить',     count: remindCount, color: '#e65100' },
    { id: 'sleeping',label: 'Спящие (>21д)',    count: sleepCount,  color: '#b71c1c' },
    { id: 'active',  label: 'Активные (≤7д)',   count: activeCount, color: '#2e7d32' },
  ];

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 1100, margin: '0 auto', padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, marginBottom: 12 }}>
        <h1 style={{ margin: 0 }}>Клиенты</h1>
        <span style={{ color: '#888', fontSize: 14 }}>всего: {total}</span>
        <button onClick={load} disabled={loading}
          style={{ marginLeft: 'auto', padding: '5px 12px', cursor: 'pointer', borderRadius: 6, border: '1px solid #ccc' }}>
          Обновить
        </button>
      </div>

      {/* Фильтры-карточки */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        {pills.map(({ id, label, count, color }) => (
          <button key={id} type="button" onClick={() => setFilter(id)}
            style={{
              padding: '8px 14px', borderRadius: 10, cursor: 'pointer', textAlign: 'left',
              border: `2px solid ${filter === id ? color : '#e0e0e0'}`,
              background: filter === id ? '#f5f5f5' : '#fff', minWidth: 110
            }}>
            <div style={{ fontSize: 20, fontWeight: 700, color }}>{count}</div>
            <div style={{ fontSize: 12, color: '#666' }}>{label}</div>
          </button>
        ))}
      </div>

      <input type="search" value={search} onChange={e => setSearch(e.target.value)}
        placeholder="Поиск: имя или телефон…"
        style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #ccc', marginBottom: 12, boxSizing: 'border-box', fontSize: 14 }} />

      {err ? <p style={{ color: '#c62828' }}>{err}</p> : null}
      {loading ? <p style={{ color: '#888' }}>Загрузка…</p> : null}

      {/* Диалог подтверждения удаления */}
      {confirmDelete ? (
        <div style={{ padding: '12px 16px', marginBottom: 12, background: '#fff8e1', border: '1px solid #ffe082', borderRadius: 8, display: 'flex', gap: 12, alignItems: 'center' }}>
          <span>Скрыть клиента <strong>{clients.find(c=>c.phone===confirmDelete)?.name || confirmDelete}</strong> из базы?</span>
          <button onClick={() => deleteClient(confirmDelete)}
            style={{ padding: '6px 14px', background: '#c62828', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>
            Да, удалить
          </button>
          <button onClick={() => setConfirmDelete(null)}
            style={{ padding: '6px 14px', border: '1px solid #ccc', borderRadius: 6, cursor: 'pointer' }}>
            Отмена
          </button>
        </div>
      ) : null}

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '2px solid #ccc', background: '#fafafa' }}>
              <th style={{ padding: '8px 10px' }}>Клиент</th>
              <th style={{ padding: '8px 10px' }}>Телефон</th>
              <th style={{ padding: '8px 10px', textAlign: 'center' }}>Заказов</th>
              <th style={{ padding: '8px 10px', textAlign: 'right' }}>Выручка</th>
              <th style={{ padding: '8px 10px', textAlign: 'right' }}>Ср. чек</th>
              <th style={{ padding: '8px 10px' }}>Первый заказ</th>
              <th style={{ padding: '8px 10px' }}>Последний</th>
              <th style={{ padding: '8px 10px', textAlign: 'center' }}>Частота</th>
              <th style={{ padding: '8px 10px' }}>Статус</th>
              <th style={{ padding: '8px 10px' }}>Канал</th>
              <th style={{ padding: '8px 10px' }} />
            </tr>
          </thead>
          <tbody>
            {displayed.map((c, i) => {
              const tag = TAG[c.tag] || TAG.regular;
              return (
                <tr key={c.phone}
                  style={{ borderBottom: '1px solid #eee', background: c.needRemind ? '#fff8e1' : i % 2 === 0 ? '#fff' : '#fafafa' }}>
                  <td style={{ padding: '8px 10px', fontWeight: c.orderCount >= 2 ? 600 : 400 }}>
                    {c.needRemind ? <span title="Пора напомнить о себе">🔔 </span> : null}
                    {c.name || '—'}
                  </td>
                  <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontSize: 12 }}>{c.phone}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 700, fontSize: 15 }}>{c.orderCount}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right' }}>{fmtRub(c.totalAmount)}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', color: '#666' }}>{fmtRub(c.avgAmount)}</td>
                  <td style={{ padding: '8px 10px', color: '#888', fontSize: 12 }}>{fmtDate(c.firstDeliveryDate)}</td>
                  <td style={{ padding: '8px 10px', fontSize: 12 }}>
                    {fmtDate(c.lastDeliveryDate)}
                    <span style={{ color: '#aaa', marginLeft: 4 }}>({c.daysSinceLast}д)</span>
                  </td>
                  <td style={{ padding: '8px 10px', textAlign: 'center', color: '#555', fontSize: 12 }}>
                    {c.avgFreqDays ? `раз в ${c.avgFreqDays}д` : '—'}
                  </td>
                  <td style={{ padding: '8px 10px' }}>
                    <span style={{ padding: '3px 8px', borderRadius: 999, fontSize: 11, background: tag.bg, color: tag.color, fontWeight: 600 }}>
                      {tag.label}
                    </span>
                  </td>
                  <td style={{ padding: '8px 10px', fontSize: 11, color: '#666' }}>
                    {c.sources?.map(s => SRC_LABEL[s] || s).join(', ') || '—'}
                  </td>
                  <td style={{ padding: '8px 10px' }}>
                    <button type="button" onClick={() => setConfirmDelete(c.phone)}
                      title="Скрыть из базы"
                      style={{ padding: '3px 8px', cursor: 'pointer', border: '1px solid #ddd', borderRadius: 6, color: '#888', fontSize: 12, background: 'transparent' }}>
                      ✕
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {displayed.length === 0 && !loading ? (
        <p style={{ color: '#888', textAlign: 'center', padding: 24 }}>Нет клиентов в этом фильтре.</p>
      ) : null}
    </div>
  );
}
