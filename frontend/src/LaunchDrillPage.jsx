import { useCallback, useEffect, useState } from 'react';
import {
  completeLaunchDrill,
  fetchContentItems,
  fetchLaunchDrill,
  fetchLaunchDrills,
  startLaunchDrill
} from './api.js';
import {
  contentStatusLabel,
  launchDrillCompleteLabels,
  launchDrillRunStatusLabel,
  pages
} from './i18n/ru.js';

function cardStyle() {
  return {
    border: '1px solid #e0e0e0',
    borderRadius: 10,
    padding: '14px 16px',
    background: '#fafafa',
    marginBottom: 16
  };
}

/** @param {string | undefined} code */
function urlSafetyOk(code) {
  return code === 'ok' || code === 'ok_external_target';
}

function fmtRubFromKopeks(k) {
  return `${(Number(k || 0) / 100).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ₽`;
}

/** @param {string | null | undefined} iso */
function fmtIsoShort(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' });
}

export function LaunchDrillPage() {
  const [items, setItems] = useState([]);
  const [drills, setDrills] = useState([]);
  const [pickId, setPickId] = useState('');
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  const [completeStatus, setCompleteStatus] = useState('SUCCESS');
  const [obsOrderId, setObsOrderId] = useState('');
  const [obsRevenueK, setObsRevenueK] = useState('');
  const [obsAttr, setObsAttr] = useState('');
  const [note, setNote] = useState('');

  const loadItems = useCallback(() => {
    fetchContentItems()
      .then((list) => {
        setItems(Array.isArray(list) ? list : []);
      })
      .catch(() => setItems([]));
  }, []);

  const loadDrills = useCallback(() => {
    fetchLaunchDrills()
      .then((list) => setDrills(Array.isArray(list) ? list : []))
      .catch(() => setDrills([]));
  }, []);

  useEffect(() => {
    loadItems();
    loadDrills();
  }, [loadItems, loadDrills]);

  async function openDetail(id) {
    setErr('');
    setLoading(true);
    try {
      const d = await fetchLaunchDrill(id);
      setDetail(d);
    } catch (e) {
      setErr(e.message || String(e));
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }

  async function handleStart() {
    if (!pickId) {
      setErr('Выберите материал');
      return;
    }
    setErr('');
    setMsg('');
    setLoading(true);
    try {
      const d = await startLaunchDrill({ contentItemId: pickId });
      setMsg('Дрилл создан (STARTED). Выполните проверки ниже и оформите заказ вручную.');
      await loadDrills();
      await openDetail(d.id);
    } catch (e) {
      setErr(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleComplete() {
    if (!detail?.id || detail.runStatus !== 'STARTED') return;
    setErr('');
    setMsg('');
    setLoading(true);
    try {
      const body = {
        runStatus: completeStatus,
        observedOrderId: obsOrderId.trim() || null,
        note: note.trim() || null,
        observedAttributionSummary: obsAttr.trim() || null
      };
      if (obsRevenueK.trim() !== '') {
        const n = parseInt(obsRevenueK, 10);
        if (!Number.isFinite(n) || n < 0) throw new Error('Выручка (коп.) — целое ≥ 0');
        body.observedRevenueKopeks = n;
      }
      await completeLaunchDrill(detail.id, body);
      setMsg('Дрилл завершён и записан.');
      setObsOrderId('');
      setObsRevenueK('');
      setObsAttr('');
      setNote('');
      await loadDrills();
      await openDetail(detail.id);
    } catch (e) {
      setErr(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  const ci = detail?.contentItem;

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 1100, margin: '0 auto', padding: 24 }}>
      <h1 style={{ marginTop: 0 }}>{pages.launchDrillTitle}</h1>
      <p style={{ color: '#555', marginTop: 0 }}>
        Ручной аудит: материал → реальная ссылка → заказ с атрибуцией → проверка в Контент / Performance. Автоматизации заказа нет.
      </p>

      <div
        style={{
          ...cardStyle(),
          background: '#e3f2fd',
          borderColor: '#90caf9'
        }}
      >
        <strong>Проверьте руками (чеклист)</strong>
        <ol style={{ margin: '8px 0 0', paddingLeft: 20, color: '#1565c0' }}>
          <li>
            <strong>Сайт (origin):</strong> ссылка ведёт на рабочий стенд (не заглушку). Сверьте с полем «PUBLIC_SITE_ORIGIN на старт».
          </li>
          <li>
            <strong>Атрибуция материала:</strong> UTM и путь совпадают с тем, что попадёт в заказ.
          </li>
          <li>
            <strong>Заказ:</strong> оформлен реальный заказ; запишите номер и сумму в копейках.
          </li>
          <li>
            <strong>Эффективность:</strong> в разделе «Контент» обновите список — у материала должны отразиться заказы и выручка (или укажите частичный успех / ошибку в примечании).
          </li>
        </ol>
      </div>

      {err ? (
        <p style={{ color: '#c62828' }} role="alert">
          {err}
        </p>
      ) : null}
      {msg ? <p style={{ color: '#2e7d32' }}>{msg}</p> : null}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }}>
        <div style={cardStyle()}>
          <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>Новый дрилл</h2>
          <label style={{ display: 'block', marginBottom: 12 }}>
            Материал
            <select
              value={pickId}
              onChange={(e) => setPickId(e.target.value)}
              style={{ display: 'block', marginTop: 4, padding: 8, width: '100%', maxWidth: 480 }}
            >
              <option value="">— выберите —</option>
              {items.map((it) => (
                <option key={it.id} value={it.id}>
                  {it.title} · {it.channel} · {contentStatusLabel(it.status)}
                </option>
              ))}
            </select>
          </label>
          <button type="button" disabled={loading} onClick={handleStart} style={{ padding: '10px 16px', cursor: 'pointer' }}>
            Старт дрилла
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => {
              loadItems();
              loadDrills();
            }}
            style={{ marginLeft: 8, padding: '10px 16px', cursor: 'pointer' }}
          >
            Обновить списки
          </button>
        </div>

        <div style={cardStyle()}>
          <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>История дриллов</h2>
          <div style={{ maxHeight: 280, overflow: 'auto', fontSize: 14 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>
                  <th style={{ padding: 6 }}>Статус</th>
                  <th style={{ padding: 6 }}>Начало</th>
                  <th style={{ padding: 6 }}>Материал</th>
                  <th style={{ padding: 6 }} />
                </tr>
              </thead>
              <tbody>
                {drills.map((d) => (
                  <tr key={d.id} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: 6 }}>{launchDrillRunStatusLabel(d.runStatus)}</td>
                    <td style={{ padding: 6, whiteSpace: 'nowrap', fontSize: 12 }}>
                      {new Date(d.startedAt).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })}
                    </td>
                    <td style={{ padding: 6 }}>{d.contentItemTitle || d.contentItemId}</td>
                    <td style={{ padding: 6 }}>
                      <button type="button" style={{ cursor: 'pointer' }} onClick={() => openDetail(d.id)}>
                        Открыть
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {drills.length === 0 ? <p style={{ color: '#666' }}>Пока нет записей.</p> : null}
          </div>
        </div>
      </div>

      {detail ? (
        <div style={cardStyle()}>
          <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>Дрилл #{detail.id.slice(0, 8)}…</h2>
          <p style={{ margin: '0 0 8px' }}>
            <strong>Статус:</strong> {launchDrillRunStatusLabel(detail.runStatus)}
            {detail.completedAt ? (
              <span style={{ marginLeft: 12 }}>
                завершён {new Date(detail.completedAt).toLocaleString('ru-RU')}
              </span>
            ) : null}
          </p>
          <p style={{ margin: '0 0 8px' }}>
            <strong>Ожидаемая ссылка (на момент старта):</strong>
          </p>
          <div style={{ wordBreak: 'break-all', fontSize: 13, marginBottom: 8 }}>{detail.expectedGeneratedUrl || '—'}</div>
          {detail.expectedGeneratedUrl ? (
            <button
              type="button"
              style={{ marginBottom: 12, cursor: 'pointer' }}
              onClick={() => navigator.clipboard.writeText(detail.expectedGeneratedUrl)}
            >
              Копировать ссылку
            </button>
          ) : null}

          <p style={{ margin: '0 0 4px' }}>
            <strong>PUBLIC_SITE_ORIGIN на старт:</strong>{' '}
            {detail.originStatusAtRun ? (
              <>
                <code>{detail.originStatusAtRun.effectiveOrigin}</code> · код {detail.originStatusAtRun.code} ·{' '}
                {detail.originStatusAtRun.isSafeForPublish ? (
                  <span style={{ color: '#2e7d32' }}>готово к публикации</span>
                ) : (
                  <span style={{ color: '#e65100' }}>не готово к публикации</span>
                )}
              </>
            ) : (
              '—'
            )}
          </p>

          {ci ? (
            <div style={{ marginTop: 12, padding: 10, background: '#fff', borderRadius: 8, border: '1px solid #e0e0e0' }}>
              <strong>Материал (снимок полей)</strong>
              <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 13 }}>
                <li>
                  Безопасность ссылки: <code>{ci.generatedUrlSafety}</code>
                  {!urlSafetyOk(ci.generatedUrlSafety) ? <span style={{ color: '#e65100' }}> — проверьте перед публикацией</span> : null}
                </li>
                <li>
                  UTM: {ci.utmSource} / {ci.utmCampaign || '—'} / {ci.utmContent || '—'}
                </li>
                <li>
                  Путь: {ci.landingPath || '—'} · целевой URL: {ci.targetUrl || '—'}
                </li>
              </ul>
            </div>
          ) : null}

          <div
            style={{
              marginTop: 12,
              padding: 10,
              background: '#f1f8e9',
              borderRadius: 8,
              border: '1px solid #c5e1a5'
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 8,
                marginBottom: 8
              }}
            >
              <strong>Сверка с эффективностью контента (текущие данные)</strong>
              <button
                type="button"
                disabled={loading || !detail.id}
                style={{ fontSize: 12, cursor: 'pointer' }}
                onClick={() => openDetail(detail.id)}
              >
                Обновить цифры
              </button>
            </div>
            <p style={{ margin: '0 0 8px', fontSize: 12, color: '#33691e' }}>
              Те же правила матчинга, что в разделе «Контент» (атрибуция заказов ↔ поля материала). Сверьте с ручными
              наблюдениями при завершении дрилла.
            </p>
            {detail.performanceEvidence ? (
              <table style={{ fontSize: 14, borderCollapse: 'collapse' }}>
                <tbody>
                  <tr>
                    <td style={{ padding: '4px 12px 4px 0', color: '#555' }}>Число заказов</td>
                    <td style={{ padding: 4, fontWeight: 600 }}>{detail.performanceEvidence.ordersCount}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '4px 12px 4px 0', color: '#555' }}>Выручка, коп.</td>
                    <td style={{ padding: 4, fontWeight: 600 }}>
                      {detail.performanceEvidence.revenueKopeks}{' '}
                      <span style={{ fontWeight: 400, color: '#666' }}>
                        ({fmtRubFromKopeks(detail.performanceEvidence.revenueKopeks)})
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <td style={{ padding: '4px 12px 4px 0', color: '#555' }}>Время последнего заказа</td>
                    <td style={{ padding: 4, fontWeight: 600 }}>{fmtIsoShort(detail.performanceEvidence.latestOrderAt)}</td>
                  </tr>
                </tbody>
              </table>
            ) : (
              <p style={{ margin: 0, color: '#666', fontSize: 13 }}>Нет данных эффективности для этого материала.</p>
            )}
          </div>

          {detail.runStatus === 'STARTED' ? (
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #ddd' }}>
              <h3 style={{ marginTop: 0, fontSize: '1rem' }}>Завершение дрилла (ручные наблюдения)</h3>
              <label style={{ display: 'block', marginBottom: 8 }}>
                Итог
                <select
                  value={completeStatus}
                  onChange={(e) => setCompleteStatus(e.target.value)}
                  style={{ display: 'block', marginTop: 4, padding: 6 }}
                >
                  <option value="SUCCESS">{launchDrillCompleteLabels.SUCCESS}</option>
                  <option value="PARTIAL">{launchDrillCompleteLabels.PARTIAL}</option>
                  <option value="FAILED">{launchDrillCompleteLabels.FAILED}</option>
                </select>
              </label>
              <label style={{ display: 'block', marginBottom: 8 }}>
                Наблюдаемый номер заказа
                <input
                  value={obsOrderId}
                  onChange={(e) => setObsOrderId(e.target.value)}
                  style={{ display: 'block', marginTop: 4, padding: 6, width: '100%', maxWidth: 400 }}
                />
              </label>
              <label style={{ display: 'block', marginBottom: 8 }}>
                Наблюдаемая выручка (копейки)
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={obsRevenueK}
                  onChange={(e) => setObsRevenueK(e.target.value)}
                  placeholder="например 150000"
                  style={{ display: 'block', marginTop: 4, padding: 6, width: '100%', maxWidth: 240 }}
                />
              </label>
              <label style={{ display: 'block', marginBottom: 8 }}>
                Сводка атрибуции в заказе (вручную)
                <input
                  value={obsAttr}
                  onChange={(e) => setObsAttr(e.target.value)}
                  placeholder="например utm_source=vk, кампания=…"
                  style={{ display: 'block', marginTop: 4, padding: 6, width: '100%', maxWidth: 520 }}
                />
              </label>
              <label style={{ display: 'block', marginBottom: 12 }}>
                Примечание
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  style={{ display: 'block', marginTop: 4, padding: 6, width: '100%', maxWidth: 520 }}
                />
              </label>
              <button type="button" disabled={loading} onClick={handleComplete} style={{ padding: '10px 16px', cursor: 'pointer' }}>
                Сохранить завершение
              </button>
            </div>
          ) : (
            <div style={{ marginTop: 16, fontSize: 14 }}>
              <p>
                <strong>Записано:</strong> заказ {detail.observedOrderId || '—'}, выручка (коп.) {detail.observedRevenueKopeks ?? '—'}
              </p>
              {detail.observedAttributionSummary ? (
                <p>
                  <strong>Атрибуция (наблюдение):</strong> {detail.observedAttributionSummary}
                </p>
              ) : null}
              {detail.note ? (
                <p>
                  <strong>Примечание:</strong> {detail.note}
                </p>
              ) : null}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
