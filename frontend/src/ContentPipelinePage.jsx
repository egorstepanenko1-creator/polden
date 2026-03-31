import { useCallback, useEffect, useState } from 'react';
import {
  createContentItem,
  fetchContentPerformance,
  fetchContentPipelineOriginStatus,
  patchContentItem
} from './api.js';
import { contentStatusLabel, pages } from './i18n/ru.js';

const STATUSES = ['IDEA', 'DRAFT', 'APPROVED', 'PUBLISHED'];

function cardStyle() {
  return {
    border: '1px solid #e0e0e0',
    borderRadius: 10,
    padding: '14px 16px',
    background: '#fafafa',
    marginBottom: 16
  };
}

/** @param {string} iso */
function publishDateInputValue(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

function fmtRubKopeks(k) {
  return `${(Number(k || 0) / 100).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ₽`;
}

/** @param {{ utmSource?: string, utmCampaign?: string | null, utmContent?: string | null }} row */
function attributionSummary(row) {
  const parts = [row.utmSource, row.utmCampaign, row.utmContent].filter((x) => x != null && String(x).trim() !== '');
  return parts.length ? parts.join(' · ') : '—';
}

/** @param {string | null | undefined} iso */
function fmtDateTimeShort(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' });
}

/** @param {string | undefined} code */
function isGeneratedUrlSafetyWarning(code) {
  return Boolean(code && code !== 'ok' && code !== 'ok_external_target');
}

const URL_SAFETY_HINT = {
  missing_env_fallback: 'PUBLIC_SITE_ORIGIN не задан — в ссылке используется заглушка example.invalid (не для публикации).',
  invalid_env_fallback: 'PUBLIC_SITE_ORIGIN невалиден — подставлена заглушка example.invalid.',
  placeholder_hostname: 'PUBLIC_SITE_ORIGIN указывает на example.invalid — задайте боевой домен.',
  ok: '',
  ok_external_target: ''
};

const ATTR_WARN_HINT = {
  no_landing_or_target: 'Нет landingPath / targetUrl — ссылка и матчинг заказов неполные.',
  no_utm_campaign_or_content: 'Нет utm_campaign и utm_content — сложнее отличить материалы в Performance.'
};

export function ContentPipelinePage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [saveMsg, setSaveMsg] = useState('');

  const [filterStatus, setFilterStatus] = useState('');
  const [filterChannel, setFilterChannel] = useState('');
  const [filterPublishDateFrom, setFilterPublishDateFrom] = useState('');
  const [filterPublishDateTo, setFilterPublishDateTo] = useState('');
  const [filterHasOrders, setFilterHasOrders] = useState('');

  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({
    title: '',
    channel: 'VK',
    contentType: 'post',
    status: 'IDEA',
    publishDate: '',
    captionDraft: '',
    creativeNote: '',
    landingPath: '',
    targetUrl: '',
    utmSource: '',
    utmMedium: '',
    utmCampaign: '',
    utmContent: ''
  });
  const [generatedUrlPreview, setGeneratedUrlPreview] = useState('');
  const [originStatus, setOriginStatus] = useState(null);
  const [originStatusErr, setOriginStatusErr] = useState('');

  useEffect(() => {
    fetchContentPipelineOriginStatus()
      .then((d) => {
        setOriginStatus(d);
        setOriginStatusErr('');
      })
      .catch((e) => {
        setOriginStatus(null);
        setOriginStatusErr(e.message || String(e));
      });
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    setErr('');
    const pFrom = filterPublishDateFrom || undefined;
    const pTo = filterPublishDateTo || filterPublishDateFrom || undefined;
    fetchContentPerformance({
      status: filterStatus || undefined,
      channel: filterChannel.trim() || undefined,
      publishDateFrom: pFrom,
      publishDateTo: pTo,
      hasOrders: filterHasOrders || undefined
    })
      .then((list) => setItems(Array.isArray(list) ? list : []))
      .catch((e) => {
        setErr(e.message || String(e));
        setItems([]);
      })
      .finally(() => setLoading(false));
  }, [filterStatus, filterChannel, filterPublishDateFrom, filterPublishDateTo, filterHasOrders]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (editingId) {
      const row = items.find((x) => x.id === editingId);
      setGeneratedUrlPreview(row?.generatedUrl || '');
    } else {
      setGeneratedUrlPreview('');
    }
  }, [editingId, items]);

  function startNew() {
    setEditingId(null);
    setSaveMsg('');
    setForm({
      title: '',
      channel: 'VK',
      contentType: 'post',
      status: 'IDEA',
      publishDate: '',
      captionDraft: '',
      creativeNote: '',
      landingPath: '',
      targetUrl: '',
      utmSource: '',
      utmMedium: '',
      utmCampaign: '',
      utmContent: ''
    });
    setGeneratedUrlPreview('');
  }

  function loadRow(row) {
    setEditingId(row.id);
    setSaveMsg('');
    setForm({
      title: row.title || '',
      channel: row.channel || 'VK',
      contentType: row.contentType || 'post',
      status: row.status || 'IDEA',
      publishDate: publishDateInputValue(row.publishDate),
      captionDraft: row.captionDraft || '',
      creativeNote: row.creativeNote || '',
      landingPath: row.landingPath || '',
      targetUrl: row.targetUrl || '',
      utmSource: row.utmSource || '',
      utmMedium: row.utmMedium || '',
      utmCampaign: row.utmCampaign || '',
      utmContent: row.utmContent || ''
    });
    setGeneratedUrlPreview(row.generatedUrl || '');
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaveMsg('');
    setErr('');
    const body = {
      title: form.title.trim(),
      channel: form.channel.trim() || 'VK',
      contentType: form.contentType.trim() || 'post',
      status: form.status,
      publishDate: form.publishDate ? form.publishDate : null,
      captionDraft: form.captionDraft,
      creativeNote: form.creativeNote.trim() || null,
      landingPath: form.landingPath.trim() || null,
      targetUrl: form.targetUrl.trim() || null,
      utmSource: form.utmSource.trim(),
      utmMedium: form.utmMedium.trim() || null,
      utmCampaign: form.utmCampaign.trim() || null,
      utmContent: form.utmContent.trim() || null
    };
    try {
      if (editingId) {
        const updated = await patchContentItem(editingId, body);
        setGeneratedUrlPreview(updated.generatedUrl || '');
        setSaveMsg('Сохранено');
      } else {
        const created = await createContentItem(body);
        setEditingId(created.id);
        setGeneratedUrlPreview(created.generatedUrl || '');
        setSaveMsg('Создано');
      }
      load();
    } catch (e) {
      setErr(e.message || String(e));
    }
  }

  async function copyUrl(url) {
    try {
      await navigator.clipboard.writeText(url);
      setSaveMsg('Ссылка скопирована');
      setTimeout(() => setSaveMsg(''), 2000);
    } catch {
      setSaveMsg('Не удалось скопировать');
    }
  }

  const editingRow = items.find((r) => r.id === editingId);
  const editingAttrWarns =
    editingRow && Array.isArray(editingRow.contentAttributionWarnings) ? editingRow.contentAttributionWarnings : [];

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 1200, margin: '0 auto', padding: 24 }}>
      <h1 style={{ marginTop: 0 }}>{pages.contentPipelineTitle}</h1>
      <p style={{ color: '#555', marginTop: 0 }}>
        Планирование контента и ссылок с UTM (VK-first), плюс фактические заказы и выручка по совпадению атрибуции с
        полями материала. Постинг в VK не автоматизируется.
      </p>

      {originStatusErr ? (
        <p style={{ color: '#c62828', marginBottom: 12 }} role="alert">
          Статус origin: {originStatusErr}
        </p>
      ) : null}
      {originStatus && !originStatus.isSafeForPublish ? (
        <div
          role="status"
          style={{
            ...cardStyle(),
            background: '#fff8e1',
            borderColor: '#ffcc80',
            marginBottom: 16
          }}
        >
          <strong>Предупреждение (PUBLIC_SITE_ORIGIN)</strong>
          <p style={{ margin: '8px 0 0', color: '#5d4037' }}>
            {URL_SAFETY_HINT[originStatus.code] || `Код: ${originStatus.code}, effectiveOrigin=${originStatus.effectiveOrigin}`}{' '}
            Ссылки с путём лендинга (без полного target URL) ведут на этот origin — для запуска задайте реальный домен в
            backend/.env и перезапустите API.
          </p>
        </div>
      ) : null}

      <div style={cardStyle()}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end', marginBottom: 12 }}>
          <label>
            Статус
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              style={{ display: 'block', marginTop: 4, padding: 6, minWidth: 140 }}
            >
              <option value="">Все</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {contentStatusLabel(s)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Канал
            <input
              value={filterChannel}
              onChange={(e) => setFilterChannel(e.target.value)}
              placeholder="VK"
              style={{ display: 'block', marginTop: 4, padding: 6, width: 120 }}
            />
          </label>
          <label>
            Дата публ. с
            <input
              type="date"
              value={filterPublishDateFrom}
              onChange={(e) => setFilterPublishDateFrom(e.target.value)}
              style={{ display: 'block', marginTop: 4, padding: 6 }}
            />
          </label>
          <label>
            по
            <input
              type="date"
              value={filterPublishDateTo}
              onChange={(e) => setFilterPublishDateTo(e.target.value)}
              style={{ display: 'block', marginTop: 4, padding: 6 }}
            />
          </label>
          <label>
            Заказы
            <select
              value={filterHasOrders}
              onChange={(e) => setFilterHasOrders(e.target.value)}
              style={{ display: 'block', marginTop: 4, padding: 6, minWidth: 160 }}
            >
              <option value="">Все</option>
              <option value="1">Есть заказы</option>
              <option value="0">Без заказов</option>
            </select>
          </label>
          <button type="button" onClick={load} style={{ padding: '8px 14px', cursor: 'pointer' }}>
            Обновить список
          </button>
          <button type="button" onClick={startNew} style={{ padding: '8px 14px', cursor: 'pointer' }}>
            Новый материал
          </button>
        </div>
        {loading ? <p style={{ margin: 0, color: '#666' }}>Загрузка…</p> : null}
        {err ? (
          <p style={{ margin: 0, color: '#c62828' }} role="alert">
            {err}
          </p>
        ) : null}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 16, alignItems: 'start' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>
                <th style={{ padding: '8px 6px' }}>Статус</th>
                <th style={{ padding: '8px 6px' }}>Дата</th>
                <th style={{ padding: '8px 6px' }}>Канал</th>
                <th style={{ padding: '8px 6px' }}>Заголовок</th>
                <th style={{ padding: '8px 6px' }}>⚠</th>
                <th style={{ padding: '8px 6px' }}>Атрибуция</th>
                <th style={{ padding: '8px 6px' }}>Заказы</th>
                <th style={{ padding: '8px 6px' }}>Выручка</th>
                <th style={{ padding: '8px 6px' }}>Посл. заказ</th>
                <th style={{ padding: '8px 6px' }}>Ссылка</th>
                <th style={{ padding: '8px 6px' }} />
              </tr>
            </thead>
            <tbody>
              {items.map((row) => {
                const perf = row.performance || {
                  ordersCount: 0,
                  revenueKopeks: 0,
                  averageOrderValueKopeks: 0,
                  latestOrderAt: null,
                  firstOrderAt: null
                };
                const hasSales = perf.ordersCount > 0;
                const approvedOrPubNoSales =
                  !hasSales && (row.status === 'APPROVED' || row.status === 'PUBLISHED');
                const urlWarn = isGeneratedUrlSafetyWarning(row.generatedUrlSafety);
                const attrWarns = Array.isArray(row.contentAttributionWarnings) ? row.contentAttributionWarnings : [];
                let rowBg;
                if (hasSales) rowBg = '#e8f5e9';
                else if (approvedOrPubNoSales) rowBg = '#fff8e1';
                return (
                  <tr
                    key={row.id}
                    style={{
                      borderBottom: '1px solid #eee',
                      background: rowBg
                    }}
                  >
                    <td style={{ padding: '8px 6px', whiteSpace: 'nowrap' }}>
                      <span
                        title={
                          hasSales
                            ? `${perf.ordersCount} заказ(ов), средний чек ${fmtRubKopeks(perf.averageOrderValueKopeks)}`
                            : approvedOrPubNoSales
                              ? 'Материал согласован или опубликован — заказов с совпавшей атрибуцией пока нет'
                              : ''
                        }
                      >
                        {contentStatusLabel(row.status)}
                      </span>
                    </td>
                    <td style={{ padding: '8px 6px', whiteSpace: 'nowrap' }}>
                      {row.publishDate ? publishDateInputValue(row.publishDate) : '—'}
                    </td>
                    <td style={{ padding: '8px 6px' }}>{row.channel}</td>
                    <td style={{ padding: '8px 6px', maxWidth: 180 }}>{row.title}</td>
                    <td style={{ padding: '8px 6px', fontSize: 11, whiteSpace: 'nowrap' }}>
                      {urlWarn ? (
                        <span
                          title={URL_SAFETY_HINT[row.generatedUrlSafety] || row.generatedUrlSafety}
                          style={{
                            display: 'inline-block',
                            padding: '2px 6px',
                            borderRadius: 4,
                            background: '#ffe0b2',
                            marginRight: 4
                          }}
                        >
                          Ссылка
                        </span>
                      ) : null}
                      {attrWarns.length ? (
                        <span
                          title={attrWarns.map((w) => ATTR_WARN_HINT[w] || w).join(' ')}
                          style={{ display: 'inline-block', padding: '2px 6px', borderRadius: 4, background: '#e3f2fd' }}
                        >
                          Атр.
                        </span>
                      ) : null}
                      {!urlWarn && !attrWarns.length ? '—' : null}
                    </td>
                    <td style={{ padding: '8px 6px', maxWidth: 160, fontSize: 12, wordBreak: 'break-word' }}>
                      {attributionSummary(row)}
                    </td>
                    <td style={{ padding: '8px 6px', fontWeight: hasSales ? 600 : 400 }}>{perf.ordersCount}</td>
                    <td style={{ padding: '8px 6px', fontWeight: hasSales ? 600 : 400 }}>{fmtRubKopeks(perf.revenueKopeks)}</td>
                    <td style={{ padding: '8px 6px', whiteSpace: 'nowrap', fontSize: 12 }}>
                      {fmtDateTimeShort(perf.latestOrderAt)}
                    </td>
                    <td style={{ padding: '8px 6px', maxWidth: 120, wordBreak: 'break-all' }}>
                      {row.generatedUrl ? (
                        <button
                          type="button"
                          onClick={() => copyUrl(row.generatedUrl)}
                          style={{ fontSize: 12, cursor: 'pointer' }}
                        >
                          Копировать
                        </button>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td style={{ padding: '8px 6px' }}>
                      <button type="button" onClick={() => loadRow(row)} style={{ cursor: 'pointer' }}>
                        Правка
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {items.length === 0 && !loading ? <p style={{ color: '#666' }}>Нет записей по фильтру.</p> : null}
        </div>

        <div style={cardStyle()}>
          <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>{editingId ? 'Редактирование' : 'Новый материал'}</h2>
          <form onSubmit={handleSave}>
            <label style={{ display: 'block', marginBottom: 10 }}>
              Заголовок *
              <input
                required
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                style={{ display: 'block', width: '100%', marginTop: 4, padding: 6, boxSizing: 'border-box' }}
              />
            </label>
            <label style={{ display: 'block', marginBottom: 10 }}>
              Канал
              <input
                value={form.channel}
                onChange={(e) => setForm((f) => ({ ...f, channel: e.target.value }))}
                style={{ display: 'block', width: '100%', marginTop: 4, padding: 6, boxSizing: 'border-box' }}
              />
            </label>
            <label style={{ display: 'block', marginBottom: 10 }}>
              Тип контента
              <input
                value={form.contentType}
                onChange={(e) => setForm((f) => ({ ...f, contentType: e.target.value }))}
                style={{ display: 'block', width: '100%', marginTop: 4, padding: 6, boxSizing: 'border-box' }}
              />
            </label>
            <label style={{ display: 'block', marginBottom: 10 }}>
              Статус
              <select
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                style={{ display: 'block', width: '100%', marginTop: 4, padding: 6 }}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {contentStatusLabel(s)}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: 'block', marginBottom: 10 }}>
              Дата публикации
              <input
                type="date"
                value={form.publishDate}
                onChange={(e) => setForm((f) => ({ ...f, publishDate: e.target.value }))}
                style={{ display: 'block', width: '100%', marginTop: 4, padding: 6, boxSizing: 'border-box' }}
              />
            </label>
            <label style={{ display: 'block', marginBottom: 10 }}>
              Черновик подписи
              <textarea
                value={form.captionDraft}
                onChange={(e) => setForm((f) => ({ ...f, captionDraft: e.target.value }))}
                rows={4}
                style={{ display: 'block', width: '100%', marginTop: 4, padding: 6, boxSizing: 'border-box' }}
              />
            </label>
            <label style={{ display: 'block', marginBottom: 10 }}>
              Заметка к креативу
              <textarea
                value={form.creativeNote}
                onChange={(e) => setForm((f) => ({ ...f, creativeNote: e.target.value }))}
                rows={2}
                style={{ display: 'block', width: '100%', marginTop: 4, padding: 6, boxSizing: 'border-box' }}
              />
            </label>
            <label style={{ display: 'block', marginBottom: 10 }}>
              Путь лендинга (например /menu)
              <input
                value={form.landingPath}
                onChange={(e) => setForm((f) => ({ ...f, landingPath: e.target.value }))}
                placeholder="/menu"
                style={{ display: 'block', width: '100%', marginTop: 4, padding: 6, boxSizing: 'border-box' }}
              />
            </label>
            <label style={{ display: 'block', marginBottom: 10 }}>
              Или полный target URL (https://…)
              <input
                value={form.targetUrl}
                onChange={(e) => setForm((f) => ({ ...f, targetUrl: e.target.value }))}
                style={{ display: 'block', width: '100%', marginTop: 4, padding: 6, boxSizing: 'border-box' }}
              />
            </label>
            <label style={{ display: 'block', marginBottom: 10 }}>
              utm_source (пусто → vk для канала VK)
              <input
                value={form.utmSource}
                onChange={(e) => setForm((f) => ({ ...f, utmSource: e.target.value }))}
                style={{ display: 'block', width: '100%', marginTop: 4, padding: 6, boxSizing: 'border-box' }}
              />
            </label>
            <label style={{ display: 'block', marginBottom: 10 }}>
              utm_campaign
              <input
                value={form.utmCampaign}
                onChange={(e) => setForm((f) => ({ ...f, utmCampaign: e.target.value }))}
                style={{ display: 'block', width: '100%', marginTop: 4, padding: 6, boxSizing: 'border-box' }}
              />
            </label>
            <label style={{ display: 'block', marginBottom: 10 }}>
              utm_content
              <input
                value={form.utmContent}
                onChange={(e) => setForm((f) => ({ ...f, utmContent: e.target.value }))}
                style={{ display: 'block', width: '100%', marginTop: 4, padding: 6, boxSizing: 'border-box' }}
              />
            </label>
            <label style={{ display: 'block', marginBottom: 10 }}>
              utm_medium
              <input
                value={form.utmMedium}
                onChange={(e) => setForm((f) => ({ ...f, utmMedium: e.target.value }))}
                style={{ display: 'block', width: '100%', marginTop: 4, padding: 6, boxSizing: 'border-box' }}
              />
            </label>
            <div style={{ marginBottom: 12, fontSize: 13, wordBreak: 'break-all' }}>
              <strong>Сгенерированная ссылка</strong>
              <div style={{ marginTop: 4, color: '#333' }}>{generatedUrlPreview || '— (сохраните запись)'}</div>
              {editingRow && isGeneratedUrlSafetyWarning(editingRow.generatedUrlSafety) ? (
                <p style={{ color: '#e65100', margin: '8px 0 0' }}>
                  {URL_SAFETY_HINT[editingRow.generatedUrlSafety] || editingRow.generatedUrlSafety}
                </p>
              ) : null}
              {!editingId && form.landingPath.trim() && !form.targetUrl.trim() && originStatus && !originStatus.isSafeForPublish ? (
                <p style={{ color: '#795548', margin: '8px 0 0', fontSize: 12 }}>
                  Для публикации задайте PUBLIC_SITE_ORIGIN на бэкенде (см. предупреждение выше).
                </p>
              ) : null}
              {editingRow && ['APPROVED', 'PUBLISHED'].includes(String(editingRow.status)) && editingAttrWarns.length ? (
                <ul style={{ color: '#1565c0', margin: '8px 0 0', paddingLeft: 18, fontSize: 12 }}>
                  {editingAttrWarns.map((w) => (
                    <li key={w}>{ATTR_WARN_HINT[w] || w}</li>
                  ))}
                </ul>
              ) : null}
              {generatedUrlPreview ? (
                <button type="button" onClick={() => copyUrl(generatedUrlPreview)} style={{ marginTop: 8, cursor: 'pointer' }}>
                  Копировать ссылку
                </button>
              ) : null}
            </div>
            <button type="submit" style={{ padding: '10px 18px', cursor: 'pointer', fontWeight: 600 }}>
              {editingId ? 'Сохранить' : 'Создать'}
            </button>
            {saveMsg ? (
              <span style={{ marginLeft: 12, color: '#2e7d32' }}>{saveMsg}</span>
            ) : null}
          </form>
        </div>
      </div>
    </div>
  );
}
