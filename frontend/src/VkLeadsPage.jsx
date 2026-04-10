import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchVkLead, fetchVkLeads, fetchVkSalesSnapshot, patchVkLead } from './api.js';
import { vkLeadStatusLabel } from './i18n/ru.js';
import { parseLeadDeliveryDate } from './leadDateParse.js';

const STATUSES = ['NEW', 'CONTACTED', 'CONVERTED', 'REJECTED'];

function cardStyle() {
  return {
    border: '1px solid #e0e0e0',
    borderRadius: 10,
    padding: '14px 16px',
    background: '#fafafa',
    marginBottom: 16
  };
}

/**
 * @param {{ branchId?: string, deliveryDate?: string }} props
 */
export function VkLeadsPage({ branchId = '', deliveryDate = '' }) {
  const [leads, setLeads] = useState([]);
  const [quickLeadFilter, setQuickLeadFilter] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [snapshot, setSnapshot] = useState(null);

  const loadList = useCallback(() => {
    setLoading(true);
    setErr('');
    fetchVkLeads()
      .then((list) => setLeads(Array.isArray(list) ? list : []))
      .catch((e) => {
        setErr(e.message || String(e));
        setLeads([]);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadList();
  }, [loadList]);

  const loadSnapshot = useCallback(() => {
    fetchVkSalesSnapshot({
      branchId: branchId || undefined,
      deliveryDate: deliveryDate || undefined
    })
      .then((d) => setSnapshot(d))
      .catch(() => setSnapshot(null));
  }, [branchId, deliveryDate]);

  useEffect(() => {
    loadSnapshot();
  }, [loadSnapshot]);

  const displayedLeads = useMemo(() => {
    if (quickLeadFilter !== 'open') return leads;
    return leads.filter(
      (r) => (r.status === 'NEW' || r.status === 'CONTACTED') && !r.convertedOrderId
    );
  }, [leads, quickLeadFilter]);

  async function openLead(id) {
    setSelectedId(id);
    setMsg('');
    try {
      const d = await fetchVkLead(id);
      setDetail(d);
    } catch (e) {
      setErr(e.message || String(e));
      setDetail(null);
    }
  }

  async function setStatus(id, status) {
    setErr('');
    try {
      await patchVkLead(id, { status });
      setMsg('Статус сохранён');
      loadList();
      if (selectedId === id) openLead(id);
    } catch (e) {
      setErr(e.message || String(e));
    }
  }

  function openOrderFormFromLead(d) {
    const { iso, unresolvedLabel } = parseLeadDeliveryDate(d.requestedDateText);
    window.dispatchEvent(
      new CustomEvent('polden-open-order-form', {
        detail: {
          vkLeadId: d.id,
          customerName: d.name,
          customerPhone: d.phone,
          address: d.address,
          comment: d.comment,
          deliveryDateIso: iso,
          requestedDateUnresolved: iso ? '' : unresolvedLabel || d.requestedDateText || ''
        }
      })
    );
  }

  async function copyLeadPlainText(d) {
    setErr('');
    setMsg('');
    const block = [
      `Имя: ${d.name}`,
      `Телефон: ${d.phone}`,
      `Адрес: ${d.address}`,
      `Дата (текст клиента): ${d.requestedDateText}`,
      `Комментарий: ${d.comment || '—'}`
    ].join('\n');
    try {
      await navigator.clipboard.writeText(block);
      setMsg('Скопировано в буфер.');
    } catch {
      setMsg(`Скопируйте вручную:\n\n${block}`);
    }
  }

  const needFollowUp = snapshot?.leadsNeedFollowUp ?? null;
  const activeDialogs = snapshot?.vkConversationsActive ?? null;

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 1100, margin: '0 auto', padding: 24 }}>
      <h1 style={{ marginTop: 0 }}>Заявки из VK</h1>
      <div style={{ padding: '10px 14px', marginBottom: 16, background: '#f3f3f3', borderRadius: 8, fontSize: 13, color: '#555', lineHeight: 1.5 }}>
        Здесь люди, которые писали в VK-бот, но заказ не создался автоматически.
        Нажми <strong>«Открыть»</strong> → <strong>«Создать заказ в CRM»</strong> — и заказ появится в разделе Заказы.
        Если заказ уже создан — статус <strong>«✅ Заказ создан»</strong>.
      </div>

      {/* Компактная сводка */}
      {snapshot ? (
        <div style={{
          display: 'flex',
          gap: 24,
          marginBottom: 16,
          padding: '10px 16px',
          background: needFollowUp > 0 ? '#fff8e1' : '#f1f8e9',
          borderRadius: 10,
          border: `1px solid ${needFollowUp > 0 ? '#ffe082' : '#c5e1a5'}`,
          fontSize: 14,
          alignItems: 'center'
        }}>
          <span>
            Нужен ответ:{' '}
            <strong style={{ color: needFollowUp > 0 ? '#e65100' : '#2e7d32', fontSize: 16 }}>
              {needFollowUp ?? '—'}
            </strong>
          </span>
          <span style={{ color: '#666' }}>Диалоги активны: <strong>{activeDialogs ?? '—'}</strong></span>
          {snapshot.ordersVkOnDeliveryDate != null && (
            <span style={{ color: '#666' }}>
              Заказы VK (10.04): <strong>{snapshot.ordersVkOnDeliveryDate}</strong>
            </span>
          )}
          <button
            type="button"
            onClick={() => { loadList(); loadSnapshot(); }}
            disabled={loading}
            style={{ marginLeft: 'auto', padding: '5px 12px', cursor: 'pointer', borderRadius: 6, border: '1px solid #ccc' }}
          >
            Обновить
          </button>
        </div>
      ) : (
        <div style={{ marginBottom: 16, textAlign: 'right' }}>
          <button
            type="button"
            onClick={() => { loadList(); loadSnapshot(); }}
            disabled={loading}
            style={{ padding: '5px 12px', cursor: 'pointer', borderRadius: 6, border: '1px solid #ccc' }}
          >
            Обновить
          </button>
        </div>
      )}

      {err ? <p style={{ color: '#c62828' }} role="alert">{err}</p> : null}
      {msg ? <p style={{ color: '#2e7d32' }}>{msg}</p> : null}

      {/* Фильтр */}
      <div style={{ marginBottom: 12, display: 'flex', gap: 8 }}>
        {[
          { id: 'all', label: 'Все' },
          { id: 'open', label: 'Нужен ответ' }
        ].map(({ id, label }) => {
          const active = id === 'all' ? quickLeadFilter !== 'open' : quickLeadFilter === 'open';
          return (
            <button
              key={id}
              type="button"
              onClick={() => setQuickLeadFilter(id === 'open' ? 'open' : '')}
              style={{
                padding: '6px 14px',
                borderRadius: 999,
                border: `1px solid ${active ? '#6a1b9a' : '#ccc'}`,
                background: active ? '#ede7f6' : '#fff',
                fontWeight: active ? 700 : 500,
                cursor: 'pointer',
                fontSize: 13
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }}>
        {/* Список */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>
                <th style={{ padding: 8 }}>Статус</th>
                <th style={{ padding: 8 }}>Имя</th>
                <th style={{ padding: 8 }}>Телефон</th>
                <th style={{ padding: 8 }}>Создан</th>
                <th style={{ padding: 8 }}>Заказ</th>
                <th style={{ padding: 8 }} />
              </tr>
            </thead>
            <tbody>
              {displayedLeads.map((r) => (
                <tr
                  key={r.id}
                  style={{
                    borderBottom: '1px solid #eee',
                    background: selectedId === r.id ? '#e3f2fd' : r.status === 'NEW' ? '#fffde7' : undefined
                  }}
                >
                  <td style={{ padding: 8 }}>
                    <strong>{vkLeadStatusLabel(r.status)}</strong>
                  </td>
                  <td style={{ padding: 8 }}>{r.name}</td>
                  <td style={{ padding: 8 }}>{r.phone}</td>
                  <td style={{ padding: 8, fontSize: 12 }}>
                    {new Date(r.createdAt).toLocaleString('ru-RU')}
                  </td>
                  <td style={{ padding: 8, fontSize: 12 }}>
                    {r.convertedOrderId ? <span style={{ color: '#2e7d32', fontWeight: 600 }}>✅ создан</span> : <span style={{ color: '#aaa' }}>нет</span>}
                  </td>
                  <td style={{ padding: 8 }}>
                    <button type="button" style={{ cursor: 'pointer' }} onClick={() => openLead(r.id)}>
                      Открыть
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {displayedLeads.length === 0 && !loading ? (
            <p style={{ color: '#666' }}>{leads.length === 0 ? 'Нет лидов.' : 'Нет лидов в этом фильтре.'}</p>
          ) : null}
        </div>

        {/* Детальная карточка */}
        <div style={cardStyle()}>
          {detail ? (
            <>
              <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>Лид VK</h2>
              <p style={{ fontSize: 12, margin: '0 0 8px', padding: '6px 10px', background: '#ede7f6', borderRadius: 8 }}>
                <strong>Статус:</strong> {vkLeadStatusLabel(detail.status)}
                {!detail.convertedOrderId && (detail.status === 'NEW' || detail.status === 'CONTACTED') ? (
                  <span style={{ marginLeft: 8, color: '#b71c1c' }}>· нужен разбор</span>
                ) : null}
              </p>
              <p style={{ margin: '8px 0' }}><strong>Имя:</strong> {detail.name}</p>
              <p style={{ margin: '8px 0' }}><strong>Телефон:</strong> {detail.phone}</p>
              <p style={{ margin: '8px 0' }}><strong>Адрес:</strong> {detail.address}</p>
              <p style={{ margin: '8px 0' }}><strong>Дата (текст клиента):</strong> {detail.requestedDateText}</p>
              <p style={{ margin: '8px 0' }}><strong>Комментарий:</strong> {detail.comment || '—'}</p>
              {detail.convertedOrderId ? (
                <p style={{ margin: '8px 0', fontSize: 14, color: '#2e7d32', fontWeight: 600 }}>
                  ✅ Заказ оформлен — можно закрыть эту заявку
                </p>
              ) : null}
              <details style={{ marginTop: 12, fontSize: 12 }}>
                <summary style={{ cursor: 'pointer', color: '#666' }}>Технические данные</summary>
                <p style={{ margin: '6px 0' }}>Источник: {detail.source} / {detail.channel}</p>
                <p style={{ margin: '6px 0' }}>VK user: {detail.vkUserId} / peer: {detail.peerId}</p>
                <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: 11 }}>{detail.rawPayloadJson}</pre>
              </details>
              <div style={{ marginTop: 16, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <label>
                  Статус
                  <select
                    value={detail.status}
                    onChange={(e) => setStatus(detail.id, e.target.value)}
                    style={{ display: 'block', marginTop: 4, padding: 6 }}
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>{vkLeadStatusLabel(s)}</option>
                    ))}
                  </select>
                </label>
                {!detail.convertedOrderId ? (
                  <button
                    type="button"
                    style={{ alignSelf: 'flex-end', padding: '8px 12px', cursor: 'pointer', fontWeight: 600 }}
                    onClick={() => openOrderFormFromLead(detail)}
                  >
                    Создать заказ в CRM
                  </button>
                ) : null}
                {!detail.convertedOrderId ? (
                  <button
                    type="button"
                    style={{ alignSelf: 'flex-end', padding: '8px 12px', cursor: 'pointer' }}
                    onClick={() => copyLeadPlainText(detail)}
                  >
                    Копировать
                  </button>
                ) : null}
              </div>
            </>
          ) : (
            <p style={{ color: '#666' }}>Выберите лид слева.</p>
          )}
        </div>
      </div>
    </div>
  );
}
