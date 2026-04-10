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

function fmtDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

const TAG_COLOR = {
  active:   '#2e7d32',
  regular:  '#1565c0',
  sleeping: '#b71c1c'
};
const TAG_LABEL = {
  active: 'Активный', regular: 'Постоянный', sleeping: 'Давно не было'
};

export function BroadcastPage({ branchId = '' }) {
  const [clients, setClients]       = useState([]);
  const [vkBase, setVkBase]         = useState([]);
  const [loadingClients, setLC]     = useState(false);
  const [loadingVk, setLV]          = useState(false);
  const [tab, setTab]               = useState('crm'); // 'crm' | 'vk'
  const [selected, setSelected]     = useState(new Set()); // vkUserId or phone
  const [text, setText]             = useState('');
  const [sending, setSending]       = useState(false);
  const [result, setResult]         = useState(null); // { sent, failed }
  const [err, setErr]               = useState('');
  const [filterTag, setFilterTag]   = useState('all');
  const [search, setSearch]         = useState('');
  const [vkErr, setVkErr]           = useState('');
  // VK filters
  const [vkMonths, setVkMonths]     = useState(10);  // последние N месяцев
  const [vkHasPhone, setVkHasPhone] = useState(false);
  const [vkHasOrder, setVkHasOrder] = useState(false);

  // Загрузка CRM-клиентов
  function loadClients() {
    setLC(true);
    const q = branchId ? `?branchId=${encodeURIComponent(branchId)}` : '';
    apiFetch(`/api/client-stats${q}`)
      .then(d => setClients(Array.isArray(d.clients) ? d.clients : []))
      .catch(e => setErr(e.message))
      .finally(() => setLC(false));
  }

  // Загрузка базы VK (переписки группы)
  function loadVkBase() {
    setLV(true);
    setVkErr('');
    apiFetch('/api/vk-customers')
      .then(d => setVkBase(Array.isArray(d) ? d : []))
      .catch(e => setVkErr(e.message || 'Ошибка загрузки базы VK'))
      .finally(() => setLV(false));
  }

  useEffect(() => { loadClients(); }, [branchId]);

  // CRM clients filtered
  const filteredClients = clients.filter(c => {
    if (filterTag !== 'all' && c.tag !== filterTag) return false;
    if (search) {
      const q = search.toLowerCase();
      return c.name.toLowerCase().includes(q) || c.phone.includes(q);
    }
    return true;
  });

  // VK base filtered
  const vkCutoff = (() => {
    const d = new Date();
    d.setMonth(d.getMonth() - vkMonths);
    return d.toISOString().slice(0, 10);
  })();

  const filteredVk = vkBase.filter(u => {
    if (vkMonths > 0 && u.lastMessageDate && u.lastMessageDate < vkCutoff) return false;
    if (vkHasPhone && !u.phone) return false;
    if (vkHasOrder && !u.hasOrder) return false;
    if (search) {
      const q = search.toLowerCase();
      return (u.name || '').toLowerCase().includes(q) || (u.phone || '').includes(q);
    }
    return true;
  });

  function toggleSelect(id) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function selectAll() {
    if (tab === 'crm') {
      setSelected(new Set(filteredClients.map(c => c.phone)));
    } else {
      setSelected(new Set(filteredVk.map(u => String(u.vkId))));
    }
  }

  function clearAll() { setSelected(new Set()); }

  async function sendBroadcast() {
    if (!text.trim()) { setErr('Введите текст сообщения'); return; }
    if (selected.size === 0) { setErr('Выберите хотя бы одного получателя'); return; }
    setSending(true);
    setErr('');
    setResult(null);
    try {
      const recipients = tab === 'crm'
        ? filteredClients.filter(c => selected.has(c.phone)).map(c => ({ phone: c.phone, name: c.name }))
        : filteredVk.filter(u => selected.has(String(u.vkId))).map(u => ({ vkId: u.vkId, name: u.name }));

      const res = await apiFetch('/api/broadcast/send', {
        method: 'POST',
        body: { text: text.trim(), recipients, channel: tab }
      });
      setResult(res);
      setSelected(new Set());
    } catch (e) {
      setErr(e.message || 'Ошибка при отправке');
    } finally {
      setSending(false);
    }
  }

  const selectedCount = selected.size;

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 1100, margin: '0 auto', padding: 24 }}>
      <h1 style={{ marginTop: 0 }}>Рассылка</h1>

      {/* Вкладки */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {[
          { id: 'crm', label: `База заказов (${clients.length})` },
          { id: 'vk',  label: `База VK ${vkBase.length ? `(${vkBase.length})` : ''}` }
        ].map(({ id, label }) => (
          <button key={id} type="button"
            onClick={() => { setTab(id); setSelected(new Set()); setSearch(''); if (id === 'vk' && vkBase.length === 0) loadVkBase(); }}
            style={{
              padding: '8px 18px', borderRadius: 8, cursor: 'pointer',
              border: `2px solid ${tab === id ? '#4a7c59' : '#ccc'}`,
              background: tab === id ? '#e8f0eb' : '#fff',
              fontWeight: tab === id ? 700 : 400, fontSize: 14
            }}>
            {label}
          </button>
        ))}
        {tab === 'vk' && (
          <button type="button" onClick={loadVkBase} disabled={loadingVk}
            style={{ marginLeft: 'auto', padding: '6px 12px', borderRadius: 6, border: '1px solid #ccc', cursor: 'pointer', fontSize: 13 }}>
            {loadingVk ? 'Загрузка…' : 'Обновить базу VK'}
          </button>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 20, alignItems: 'start' }}>
        {/* Список получателей */}
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <input type="search" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Поиск…"
              style={{ flex: 1, minWidth: 160, padding: '6px 10px', borderRadius: 6, border: '1px solid #ccc', fontSize: 13 }} />
            {tab === 'crm' && (
              <>
                {['all', 'active', 'regular', 'sleeping'].map(t => (
                  <button key={t} type="button" onClick={() => setFilterTag(t)}
                    style={{
                      padding: '5px 10px', borderRadius: 999, cursor: 'pointer', fontSize: 12,
                      border: `1px solid ${filterTag === t ? '#4a7c59' : '#ccc'}`,
                      background: filterTag === t ? '#e8f0eb' : '#fff',
                      fontWeight: filterTag === t ? 700 : 400
                    }}>
                    {t === 'all' ? 'Все' : TAG_LABEL[t]}
                  </button>
                ))}
              </>
            )}
            <button type="button" onClick={selectAll}
              style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid #ccc', cursor: 'pointer', fontSize: 12 }}>
              Выбрать всех
            </button>
            {selectedCount > 0 && (
              <button type="button" onClick={clearAll}
                style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid #ccc', cursor: 'pointer', fontSize: 12, color: '#c62828' }}>
                Снять ({selectedCount})
              </button>
            )}
          </div>

          {tab === 'crm' && (
            <div style={{ maxHeight: 460, overflowY: 'auto', border: '1px solid #e0e0e0', borderRadius: 8 }}>
              {loadingClients ? <p style={{ padding: 16, color: '#888' }}>Загрузка…</p> : null}
              {filteredClients.map(c => {
                const checked = selected.has(c.phone);
                return (
                  <label key={c.phone} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px',
                    borderBottom: '1px solid #f0f0f0', cursor: 'pointer',
                    background: checked ? '#e8f5e9' : 'transparent'
                  }}>
                    <input type="checkbox" checked={checked} onChange={() => toggleSelect(c.phone)} style={{ width: 16, height: 16, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{c.name || '—'}</div>
                      <div style={{ fontSize: 12, color: '#888' }}>{c.phone} · {c.orderCount} заказ. · посл. {fmtDate(c.lastDeliveryDate)}</div>
                    </div>
                    <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 999, background: '#f0f0f0', color: TAG_COLOR[c.tag] || '#555', flexShrink: 0 }}>
                      {TAG_LABEL[c.tag] || c.tag}
                    </span>
                  </label>
                );
              })}
              {filteredClients.length === 0 && !loadingClients && (
                <p style={{ padding: 16, color: '#888' }}>Нет клиентов.</p>
              )}
            </div>
          )}

          {tab === 'vk' && (
            <div>
              {vkErr ? <p style={{ color: '#c62828' }}>{vkErr}</p> : null}
              {/* Фильтры VK */}
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10, padding: '10px 12px', background: '#f5f5f5', borderRadius: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#555' }}>Фильтры:</span>
                <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 4 }}>
                  Активны за:
                  <select value={vkMonths} onChange={e => setVkMonths(Number(e.target.value))}
                    style={{ marginLeft: 4, padding: '3px 6px', borderRadius: 6, border: '1px solid #ccc', fontSize: 13 }}>
                    <option value={3}>3 мес.</option>
                    <option value={6}>6 мес.</option>
                    <option value={10}>10 мес.</option>
                    <option value={12}>1 год</option>
                    <option value={0}>Все</option>
                  </select>
                </label>
                <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                  <input type="checkbox" checked={vkHasPhone} onChange={e => setVkHasPhone(e.target.checked)} />
                  Только с телефоном
                </label>
                <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                  <input type="checkbox" checked={vkHasOrder} onChange={e => setVkHasOrder(e.target.checked)} />
                  Только с заказами
                </label>
                {vkBase.length > 0 && (
                  <span style={{ marginLeft: 'auto', fontSize: 13, color: '#888' }}>
                    Показано: <strong>{filteredVk.length}</strong> из {vkBase.length}
                  </span>
                )}
              </div>
              {loadingVk ? (
                <p style={{ color: '#888', padding: 16 }}>Загружаем базу VK — это может занять 1-2 минуты, сканируем переписки…</p>
              ) : (
                <div style={{ maxHeight: 460, overflowY: 'auto', border: '1px solid #e0e0e0', borderRadius: 8 }}>
                  {filteredVk.map(u => {
                    const id = String(u.vkId);
                    const checked = selected.has(id);
                    return (
                      <label key={id} style={{
                        display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px',
                        borderBottom: '1px solid #f0f0f0', cursor: 'pointer',
                        background: checked ? '#e8f5e9' : 'transparent'
                      }}>
                        <input type="checkbox" checked={checked} onChange={() => toggleSelect(id)} style={{ width: 16, height: 16, flexShrink: 0 }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600, fontSize: 14 }}>{u.name || `ID ${u.vkId}`}</div>
                          <div style={{ fontSize: 12, color: '#888' }}>
                            {u.phone || 'телефон неизвестен'} · посл. сообщение: {u.lastMessageDate || '—'}
                          </div>
                        </div>
                        {u.phone && <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 999, background: '#e8f5e9', color: '#2e7d32' }}>есть телефон</span>}
                      </label>
                    );
                  })}
                  {filteredVk.length === 0 && !loadingVk && vkBase.length === 0 && (
                    <p style={{ padding: 16, color: '#888' }}>Нажмите «Обновить базу VK» чтобы загрузить контакты из переписок группы.</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Правая панель — составить сообщение */}
        <div style={{ position: 'sticky', top: 20 }}>
          <div style={{ border: '1px solid #e0e0e0', borderRadius: 10, padding: 16, background: '#fafafa' }}>
            <h3 style={{ margin: '0 0 12px' }}>Сообщение</h3>

            <div style={{ marginBottom: 10, fontSize: 13, color: '#555' }}>
              Выбрано получателей: <strong style={{ fontSize: 16, color: selectedCount > 0 ? '#2e7d32' : '#aaa' }}>{selectedCount}</strong>
            </div>

            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="Привет! Завтра у нас в меню..."
              rows={7}
              style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 8, border: '1px solid #ccc', fontSize: 14, resize: 'vertical', fontFamily: 'inherit' }}
            />
            <div style={{ fontSize: 12, color: '#888', marginBottom: 12 }}>{text.length} символов</div>

            {/* Шаблоны */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>Шаблоны:</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {[
                  ['Меню завтра', 'Привет! Завтра у нас готовим: [блюда]. Принимаем заказы до 21:00. Ответьте этим сообщением или нажмите кнопку в меню 🍱'],
                  ['Давно не было', 'Привет! Давно тебя не было — скучаем 😊 Завтра можем привезти вкусный обед. Напиши нам!'],
                  ['Акция', 'Привет! Специально для тебя: [текст акции]. Заказывай скорее! 🎉'],
                ].map(([name, tmpl]) => (
                  <button key={name} type="button" onClick={() => setText(tmpl)}
                    style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #ccc', cursor: 'pointer', fontSize: 12, background: '#fff' }}>
                    {name}
                  </button>
                ))}
              </div>
            </div>

            {err ? <p style={{ color: '#c62828', fontSize: 13 }}>{err}</p> : null}

            {result ? (
              <div style={{ padding: '10px 12px', marginBottom: 12, borderRadius: 8, background: '#e8f5e9', border: '1px solid #c8e6c9' }}>
                <strong>Готово!</strong> Отправлено: {result.sent}, ошибок: {result.failed ?? 0}
              </div>
            ) : null}

            <button type="button" onClick={sendBroadcast} disabled={sending || selectedCount === 0 || !text.trim()}
              style={{
                width: '100%', padding: '11px', borderRadius: 8, border: 'none', cursor: 'pointer',
                background: selectedCount > 0 && text.trim() ? '#4a7c59' : '#ccc',
                color: '#fff', fontWeight: 700, fontSize: 15
              }}>
              {sending ? 'Отправка…' : `Отправить ${selectedCount > 0 ? `(${selectedCount})` : ''}`}
            </button>
            <p style={{ fontSize: 11, color: '#aaa', margin: '8px 0 0', textAlign: 'center' }}>
              Сообщения уйдут через VK-бот группы
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
