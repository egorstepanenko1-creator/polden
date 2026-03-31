import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchVkBotReadiness, fetchVkLead, fetchVkLeads, fetchVkSalesSnapshot, patchVkLead } from './api.js';
import { vkLeadStatusLabel, vkReadiness } from './i18n/ru.js';
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
 * @param {{ branchId?: string, deliveryDate?: string }} props — для сводки заказов VK на дату доставки (как на экране «Заказы»).
 */
export function VkLeadsPage({ branchId = '', deliveryDate = '' }) {
  const [leads, setLeads] = useState([]);
  const [filterStatus, setFilterStatus] = useState('');
  /** '' | 'open' — без заказа, NEW или CONTACTED */
  const [quickLeadFilter, setQuickLeadFilter] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [readiness, setReadiness] = useState(null);
  const [readinessErr, setReadinessErr] = useState('');
  const [snapshot, setSnapshot] = useState(null);

  const loadList = useCallback(() => {
    setLoading(true);
    setErr('');
    fetchVkLeads({ status: filterStatus || undefined })
      .then((list) => setLeads(Array.isArray(list) ? list : []))
      .catch((e) => {
        setErr(e.message || String(e));
        setLeads([]);
      })
      .finally(() => setLoading(false));
  }, [filterStatus]);

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

  function applyLeadQuick(kind) {
    if (kind === 'all') {
      setQuickLeadFilter('');
      setFilterStatus('');
    } else if (kind === 'new') {
      setQuickLeadFilter('');
      setFilterStatus('NEW');
    } else if (kind === 'open') {
      setFilterStatus('');
      setQuickLeadFilter('open');
    }
  }

  useEffect(() => {
    setReadinessErr('');
    fetchVkBotReadiness()
      .then((d) => setReadiness(d))
      .catch((e) => {
        setReadiness(null);
        setReadinessErr(e.message || String(e));
      });
  }, []);

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
      `Комментарий: ${d.comment || '—'}`,
      `VK peer: ${d.peerId} · user: ${d.vkUserId}`,
      '',
      `Лид ID: ${d.id}`
    ].join('\n');
    try {
      await navigator.clipboard.writeText(block);
      setMsg('Текст лида скопирован в буфер (статус лида не менялся).');
    } catch {
      setMsg(`Буфер недоступен — скопируйте вручную:\n\n${block.slice(0, 2000)}${block.length > 2000 ? '…' : ''}`);
    }
  }

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 1100, margin: '0 auto', padding: 24 }}>
      <h1 style={{ marginTop: 0 }}>Лиды VK</h1>
      <p style={{ color: '#555', marginTop: 0 }}>
        Заявки из VK-бота (не заказы). Кнопка «Создать заказ в CRM» открывает форму с предзаполнением; позиции меню оператор выбирает
        вручную (из лида структурированных позиций нет).
      </p>

      {readinessErr ? (
        <p style={{ color: '#c62828' }} role="alert">
          Проверка готовности VK: {readinessErr}
        </p>
      ) : readiness ? (
        <div style={{ ...cardStyle(), background: readiness.vkLiveDrillReady ? '#e8f5e9' : '#fff8e1' }}>
          <strong>{vkReadiness.panelTitle}</strong>
          <p style={{ margin: '8px 0 0', fontSize: 14 }}>
            Статус:{' '}
            <strong>
              {readiness.vkLiveDrillReady ? vkReadiness.readyTitle : vkReadiness.blockedTitle}
            </strong>
          </p>
          <ul style={{ margin: '8px 0 0', paddingLeft: 20, fontSize: 14 }}>
            <li>
              Вебхук POST: <code>{readiness.webhookPostUrl}</code>
            </li>
            <li>VK_GROUP_ACCESS_TOKEN: {readiness.vkGroupAccessTokenConfigured ? 'задан' : 'нужен в .env'}</li>
            <li>VK_CALLBACK_CONFIRMATION_CODE: {readiness.vkCallbackConfirmationConfigured ? 'задан' : 'нужен в .env'}</li>
            <li>VK_WEBHOOK_SECRET: {readiness.vkWebhookSecretConfigured ? 'задан' : 'опционально'}</li>
            <li>
              Меню дня (VK):{' '}
              {readiness.menuDaily?.present
                ? readiness.menuDaily.hasUsableCaption
                  ? `есть («${readiness.menuDaily.title}»)`
                  : 'есть, но текст подписи слишком короткий'
                : 'нет'}
            </li>
            <li>
              Ссылка в меню (публикация):{' '}
              {readiness.menuDaily?.generatedUrlPublishSafe ? vkReadiness.linkOk : vkReadiness.linkNeedsOrigin}
            </li>
            <li>
              Токен CRM в .env:{' '}
              {readiness.crmInternalTokenFromEnv ? vkReadiness.crmTokenEnvYes : vkReadiness.crmTokenEnvNo}
            </li>
            <li>
              Заказ из бота (MenuDayItem на завтра):{' '}
              <strong>{readiness.vkStructuredOrderReady ? 'готово' : 'есть блокеры'}</strong>
              {readiness.vkOrderableMenu?.sellableSlotCount != null
                ? ` — слотов с названием: ${readiness.vkOrderableMenu.sellableSlotCount} (${readiness.vkOrderableMenu.branchName || 'точка'}, ${readiness.vkOrderableMenu.deliveryDate || 'дата'})`
                : null}
            </li>
          </ul>
          {readiness.vkStructuredOrderBlockers?.length ? (
            <ul style={{ color: '#b71c1c', margin: '8px 0 0', paddingLeft: 20, fontSize: 13 }}>
              {readiness.vkStructuredOrderBlockers.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          ) : null}
          {readiness.vkLiveDrillBlockers?.length ? (
            <ul style={{ color: '#b71c1c', margin: '8px 0 0', paddingLeft: 20, fontSize: 13 }}>
              {readiness.vkLiveDrillBlockers.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          ) : null}
          {readiness.menuDaily?.botMessagePreview ? (
            <details style={{ marginTop: 10, fontSize: 13 }}>
              <summary>Превью текста меню в боте</summary>
              <pre style={{ whiteSpace: 'pre-wrap', margin: '8px 0 0' }}>{readiness.menuDaily.botMessagePreview}</pre>
            </details>
          ) : null}
          {Array.isArray(readiness.vkOperatorDiagnostics?.hints) &&
          readiness.vkOperatorDiagnostics.hints.length ? (
            <details style={{ marginTop: 12, fontSize: 13 }}>
              <summary>Диагностика: заявка vs заказ в VK</summary>
              <ul style={{ margin: '8px 0 0', paddingLeft: 18, color: '#424242' }}>
                {readiness.vkOperatorDiagnostics.hints.map((h) => (
                  <li key={h} style={{ marginBottom: 6 }}>
                    {h}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      ) : (
        <p style={{ color: '#666' }}>{vkReadiness.loading}</p>
      )}

      {err ? (
        <p style={{ color: '#c62828' }} role="alert">
          {err}
        </p>
      ) : null}
      {msg ? <p style={{ color: '#2e7d32' }}>{msg}</p> : null}

      {snapshot ? (
        <div
          style={{
            ...cardStyle(),
            background: '#f3e5f5',
            borderColor: '#ce93d8',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '12px 20px',
            alignItems: 'baseline',
            fontSize: 14
          }}
        >
          <strong style={{ width: '100%', marginBottom: 4 }}>VK сейчас (сводка)</strong>
          <span>
            Лиды <strong>NEW</strong>: {snapshot.leadsNew ?? '—'}
          </span>
          <span>
            Лидов за сегодня (сервер): {snapshot.leadsCreatedToday ?? '—'}
          </span>
          <span>
            Нужен ответ (NEW/на связи, без заказа): <strong>{snapshot.leadsNeedFollowUp ?? '—'}</strong>
          </span>
          <span>
            Диалоги не IDLE: {snapshot.vkConversationsActive ?? '—'}
          </span>
          {snapshot.ordersVkOnDeliveryDate != null ? (
            <span title="Заказы с каналом VK на выбранную в «Заказах» дату доставки">
              Заказы VK на дату {snapshot.deliveryDate}: <strong>{snapshot.ordersVkOnDeliveryDate}</strong>
              {snapshot.ordersVkNewOnDeliveryDate != null
                ? ` (из них NEW: ${snapshot.ordersVkNewOnDeliveryDate})`
                : ''}
            </span>
          ) : (
            <span style={{ color: '#666', fontSize: 13 }}>
              Для счётчика заказов VK откройте «Заказы», выберите точку и дату — они подставятся сюда автоматически.
            </span>
          )}
        </div>
      ) : null}

      <div style={cardStyle()}>
        <div style={{ marginBottom: 10, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <span style={{ fontWeight: 600, fontSize: 13 }}>Быстрый фильтр:</span>
          {[
            { id: 'all', label: 'Все' },
            { id: 'new', label: 'Только NEW' },
            { id: 'open', label: 'Нужен ответ' }
          ].map(({ id, label }) => {
            const active =
              (id === 'all' && !filterStatus && quickLeadFilter !== 'open') ||
              (id === 'new' && filterStatus === 'NEW' && quickLeadFilter !== 'open') ||
              (id === 'open' && quickLeadFilter === 'open');
            return (
              <button
                key={id}
                type="button"
                onClick={() => applyLeadQuick(id)}
                style={{
                  padding: '6px 12px',
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
        <label style={{ marginRight: 12 }}>
          Статус (API)
          <select
            value={filterStatus}
            onChange={(e) => {
              setQuickLeadFilter('');
              setFilterStatus(e.target.value);
            }}
            style={{ display: 'block', marginTop: 4, padding: 6 }}
          >
            <option value="">Все</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {vkLeadStatusLabel(s)}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => {
            loadList();
            loadSnapshot();
          }}
          disabled={loading}
          style={{ padding: '8px 14px', cursor: 'pointer' }}
        >
          Обновить
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>
                <th style={{ padding: 8 }}>Статус</th>
                <th style={{ padding: 8 }}>Канал</th>
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
                    background:
                      selectedId === r.id ? '#e3f2fd' : r.status === 'NEW' ? '#fffde7' : undefined
                  }}
                >
                  <td style={{ padding: 8 }}>
                    <strong>{vkLeadStatusLabel(r.status)}</strong>
                  </td>
                  <td style={{ padding: 8, fontSize: 12, fontWeight: 600, color: '#4527a0' }}>VK</td>
                  <td style={{ padding: 8 }}>{r.name}</td>
                  <td style={{ padding: 8 }}>{r.phone}</td>
                  <td style={{ padding: 8, fontSize: 12 }}>{new Date(r.createdAt).toLocaleString('ru-RU')}</td>
                  <td style={{ padding: 8, fontSize: 11 }}>
                    {r.convertedOrderId ? <code title="ID заказа">{r.convertedOrderId.slice(0, 8)}…</code> : '—'}
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

        <div style={cardStyle()}>
          {detail ? (
            <>
              <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>Лид VK</h2>
              <p style={{ fontSize: 12, margin: '0 0 8px', padding: '6px 10px', background: '#ede7f6', borderRadius: 8 }}>
                <strong>Статус:</strong> {vkLeadStatusLabel(detail.status)}
                {!detail.convertedOrderId && (detail.status === 'NEW' || detail.status === 'CONTACTED') ? (
                  <span style={{ marginLeft: 8, color: '#b71c1c' }}>· нужен разбор / заказ</span>
                ) : null}
              </p>
              <p style={{ fontSize: 13, margin: '4px 0' }}>
                <strong>Источник / канал:</strong> {detail.source} / {detail.channel}
              </p>
              <p style={{ fontSize: 13, margin: '4px 0' }}>
                <strong>ID пользователя VK / диалога:</strong> {detail.vkUserId} / {detail.peerId}
              </p>
              <hr style={{ border: 'none', borderTop: '1px solid #ddd' }} />
              <p style={{ margin: '8px 0' }}>
                <strong>Имя:</strong> {detail.name}
              </p>
              <p style={{ margin: '8px 0' }}>
                <strong>Телефон:</strong> {detail.phone}
              </p>
              <p style={{ margin: '8px 0' }}>
                <strong>Адрес:</strong> {detail.address}
              </p>
              <p style={{ margin: '8px 0' }}>
                <strong>Желаемая дата (текст):</strong> {detail.requestedDateText}
              </p>
              <p style={{ margin: '8px 0' }}>
                <strong>Комментарий:</strong> {detail.comment || '—'}
              </p>
              {detail.attributionCampaign ? (
                <p style={{ margin: '8px 0', fontSize: 13 }}>
                  <strong>Кампания (из меню CRM):</strong> {detail.attributionCampaign}
                </p>
              ) : null}
              {detail.menuContentItemId ? (
                <p style={{ margin: '8px 0', fontSize: 12, color: '#666' }}>
                  ID материала меню: {detail.menuContentItemId}
                </p>
              ) : null}
              {detail.convertedOrderId ? (
                <p style={{ margin: '8px 0', fontSize: 14, color: '#2e7d32' }}>
                  Уже оформлен заказ: <code>{detail.convertedOrderId}</code>
                </p>
              ) : null}
              <details style={{ marginTop: 12, fontSize: 12 }}>
                <summary>Сырые данные от VK (JSON)</summary>
                <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{detail.rawPayloadJson}</pre>
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
                      <option key={s} value={s}>
                        {vkLeadStatusLabel(s)}
                      </option>
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
                    Копировать текст в буфер
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
