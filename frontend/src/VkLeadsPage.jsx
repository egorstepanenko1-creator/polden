import { useCallback, useEffect, useState } from 'react';
import { fetchVkBotReadiness, fetchVkLead, fetchVkLeads, patchVkLead, postVkLeadConvert } from './api.js';
import { nav, vkLeadStatusLabel, vkReadiness } from './i18n/ru.js';

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

export function VkLeadsPage() {
  const [leads, setLeads] = useState([]);
  const [filterStatus, setFilterStatus] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [readiness, setReadiness] = useState(null);
  const [readinessErr, setReadinessErr] = useState('');

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

  async function convertLead(id) {
    setErr('');
    setMsg('');
    try {
      const data = await postVkLeadConvert(id);
      const block = [
        `Имя: ${data.prefill?.customerName}`,
        `Телефон: ${data.prefill?.customerPhone}`,
        `Адрес: ${data.prefill?.address}`,
        `Дата (запрос клиента): ${data.prefill?.deliveryDateText}`,
        `Комментарий: ${data.prefill?.comment || '—'}`,
        '',
        data.hint || ''
      ].join('\n');
      try {
        await navigator.clipboard.writeText(block);
        setMsg(
          `Статус: «${vkLeadStatusLabel('CONVERTED')}». Данные для заказа скопированы. Откройте «${nav.ordersKpi}» и оформите заказ вручную.`
        );
      } catch {
        setMsg(
          `Статус: «${vkLeadStatusLabel('CONVERTED')}». Буфер недоступен — скопируйте текст ниже вручную:\n\n${block.slice(0, 2000)}${block.length > 2000 ? '…' : ''}`
        );
      }
      loadList();
      openLead(id);
    } catch (e) {
      setErr(e.message || String(e));
    }
  }

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 1100, margin: '0 auto', padding: 24 }}>
      <h1 style={{ marginTop: 0 }}>Лиды VK</h1>
      <p style={{ color: '#555', marginTop: 0 }}>
        Заявки из VK-бота (не заказы). Оформление — вручную через основной поток заказов CRM.
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
          </ul>
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

      <div style={cardStyle()}>
        <label style={{ marginRight: 12 }}>
          Статус
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
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
        <button type="button" onClick={loadList} disabled={loading} style={{ padding: '8px 14px', cursor: 'pointer' }}>
          Обновить
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>
                <th style={{ padding: 8 }}>Статус</th>
                <th style={{ padding: 8 }}>Имя</th>
                <th style={{ padding: 8 }}>Телефон</th>
                <th style={{ padding: 8 }}>Дата</th>
                <th style={{ padding: 8 }} />
              </tr>
            </thead>
            <tbody>
              {leads.map((r) => (
                <tr key={r.id} style={{ borderBottom: '1px solid #eee', background: selectedId === r.id ? '#e3f2fd' : undefined }}>
                  <td style={{ padding: 8 }}>{vkLeadStatusLabel(r.status)}</td>
                  <td style={{ padding: 8 }}>{r.name}</td>
                  <td style={{ padding: 8 }}>{r.phone}</td>
                  <td style={{ padding: 8, fontSize: 12 }}>{new Date(r.createdAt).toLocaleString('ru-RU')}</td>
                  <td style={{ padding: 8 }}>
                    <button type="button" style={{ cursor: 'pointer' }} onClick={() => openLead(r.id)}>
                      Открыть
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {leads.length === 0 && !loading ? <p style={{ color: '#666' }}>Нет лидов.</p> : null}
        </div>

        <div style={cardStyle()}>
          {detail ? (
            <>
              <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>Лид</h2>
              <p style={{ fontSize: 13, margin: '4px 0' }}>
                <strong>Источник / канал:</strong> {detail.source} / {detail.channel}
              </p>
              <p style={{ fontSize: 13, margin: '4px 0' }}>
                <strong>ID пользователя VK / диалога:</strong> {detail.vkUserId} / {detail.peerId}
              </p>
              <p style={{ fontSize: 13, margin: '4px 0' }}>
                <strong>Статус:</strong> {vkLeadStatusLabel(detail.status)}
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
                {detail.status !== 'CONVERTED' ? (
                  <button
                    type="button"
                    style={{ alignSelf: 'flex-end', padding: '8px 12px', cursor: 'pointer' }}
                    onClick={() => convertLead(detail.id)}
                  >
                    В заказ: скопировать данные в буфер
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
