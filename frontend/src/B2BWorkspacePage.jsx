import { useCallback, useEffect, useState } from 'react';
import {
  fetchCompanyAccounts,
  fetchCorporateLeads,
  patchCompanyAccount,
  patchCorporateLead,
  postCompanyAccount,
  postConvertCorporateLead,
  postCorporateLead
} from './api.js';
import { corporateLeadStatusLabel, companyAccountStatusLabel, orderSourceChannelLabel } from './i18n/ru.js';

const LEAD_STATUSES = ['NEW', 'CONTACTED', 'QUOTED', 'PILOT', 'ACTIVE', 'LOST'];
const COMPANY_STATUSES = ['NEW', 'ACTIVE', 'PAUSED', 'LOST'];

function cardStyle() {
  return {
    border: '1px solid #e0e0e0',
    borderRadius: 10,
    padding: '12px 14px',
    background: '#fafafa',
    marginBottom: 12
  };
}

/**
 * @param {{ branches: Array<{ id: string, name: string }>, defaultBranchId: string }} props
 */
export function B2BWorkspacePage({ branches, defaultBranchId }) {
  const [tab, setTab] = useState('leads');
  const [filterStatus, setFilterStatus] = useState('');
  const [searchQ, setSearchQ] = useState('');
  const [leadsPack, setLeadsPack] = useState({ items: [], leadCountsByStatus: {}, companyCountsByStatus: {} });
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [convertBranchId, setConvertBranchId] = useState('');
  const [convertLeadId, setConvertLeadId] = useState(null);

  const [newLead, setNewLead] = useState({
    companyName: '',
    contactName: '',
    phone: '',
    city: '',
    address: '',
    headcountEstimate: '',
    preferredDeliveryTime: '',
    comment: ''
  });
  const [newCo, setNewCo] = useState({
    companyName: '',
    city: '',
    address: '',
    notes: '',
    primaryName: '',
    primaryPhone: ''
  });
  const [summary, setSummary] = useState({ leadCountsByStatus: {}, companyCountsByStatus: {} });

  useEffect(() => {
    fetchCorporateLeads({})
      .then((d) => {
        setSummary({
          leadCountsByStatus: d?.leadCountsByStatus || {},
          companyCountsByStatus: d?.companyCountsByStatus || {}
        });
      })
      .catch(() => {});
  }, []);

  const loadLeads = useCallback(() => {
    setLoading(true);
    setErr('');
    fetchCorporateLeads({
      status: filterStatus || undefined,
      q: searchQ.trim().length >= 2 ? searchQ.trim() : undefined
    })
      .then((d) => {
        setLeadsPack({
          items: Array.isArray(d?.items) ? d.items : [],
          leadCountsByStatus: d?.leadCountsByStatus || {},
          companyCountsByStatus: d?.companyCountsByStatus || {}
        });
        setSummary({
          leadCountsByStatus: d?.leadCountsByStatus || {},
          companyCountsByStatus: d?.companyCountsByStatus || {}
        });
      })
      .catch((e) => {
        setErr(e.message || String(e));
        setLeadsPack({ items: [], leadCountsByStatus: {}, companyCountsByStatus: {} });
      })
      .finally(() => setLoading(false));
  }, [filterStatus, searchQ]);

  const loadCompanies = useCallback(() => {
    setLoading(true);
    setErr('');
    fetchCompanyAccounts({
      status: filterStatus || undefined,
      q: searchQ.trim().length >= 2 ? searchQ.trim() : undefined
    })
      .then((d) => setCompanies(Array.isArray(d?.items) ? d.items : []))
      .catch((e) => {
        setErr(e.message || String(e));
        setCompanies([]);
      })
      .finally(() => setLoading(false));
  }, [filterStatus, searchQ]);

  useEffect(() => {
    if (tab === 'leads') loadLeads();
    else loadCompanies();
  }, [tab, loadLeads, loadCompanies]);

  useEffect(() => {
    setConvertBranchId(defaultBranchId || branches[0]?.id || '');
  }, [defaultBranchId, branches]);

  function openOrderFromCompany(c) {
    const c0 = c.contacts?.[0];
    window.dispatchEvent(
      new CustomEvent('polden-open-order-form', {
        detail: {
          companyAccountId: c.id,
          customerName: (c0?.name || c.companyName || '').trim(),
          customerPhone: c0?.phone || '',
          address: c.address || '',
          comment: `B2B · ${c.companyName} · company:${c.id}`,
          sourceChannel: 'PHONE',
          defaultBranchId: c.defaultBranchId || null
        }
      })
    );
  }

  async function saveLeadStatus(id, status) {
    setErr('');
    setMsg('');
    try {
      await patchCorporateLead(id, { status });
      setMsg('Статус лида сохранён');
      loadLeads();
    } catch (e) {
      setErr(e.message || String(e));
    }
  }

  async function saveCompanyStatus(id, status) {
    setErr('');
    setMsg('');
    try {
      await patchCompanyAccount(id, { status });
      setMsg('Статус компании сохранён');
      loadCompanies();
      fetchCorporateLeads({})
        .then((d) =>
          setSummary({
            leadCountsByStatus: d?.leadCountsByStatus || {},
            companyCountsByStatus: d?.companyCountsByStatus || {}
          })
        )
        .catch(() => {});
    } catch (e) {
      setErr(e.message || String(e));
    }
  }

  async function convertLead(id) {
    setErr('');
    setMsg('');
    try {
      await postConvertCorporateLead(id, { defaultBranchId: convertBranchId || null });
      setMsg('Компания создана, лид привязан');
      setConvertLeadId(null);
      loadLeads();
      loadCompanies();
      fetchCorporateLeads({})
        .then((d) =>
          setSummary({
            leadCountsByStatus: d?.leadCountsByStatus || {},
            companyCountsByStatus: d?.companyCountsByStatus || {}
          })
        )
        .catch(() => {});
    } catch (e) {
      setErr(e.message || String(e));
    }
  }

  async function submitNewLead(e) {
    e.preventDefault();
    setErr('');
    setMsg('');
    try {
      await postCorporateLead({
        companyName: newLead.companyName,
        contactName: newLead.contactName,
        phone: newLead.phone,
        city: newLead.city,
        address: newLead.address,
        headcountEstimate: newLead.headcountEstimate || undefined,
        preferredDeliveryTime: newLead.preferredDeliveryTime || undefined,
        comment: newLead.comment || undefined,
        sourceChannel: 'MANUAL',
        status: 'NEW'
      });
      setMsg('Заявка создана');
      setNewLead({
        companyName: '',
        contactName: '',
        phone: '',
        city: '',
        address: '',
        headcountEstimate: '',
        preferredDeliveryTime: '',
        comment: ''
      });
      loadLeads();
      fetchCorporateLeads({})
        .then((d) =>
          setSummary({
            leadCountsByStatus: d?.leadCountsByStatus || {},
            companyCountsByStatus: d?.companyCountsByStatus || {}
          })
        )
        .catch(() => {});
    } catch (e) {
      setErr(e.message || String(e));
    }
  }

  async function submitNewCompany(e) {
    e.preventDefault();
    setErr('');
    setMsg('');
    try {
      const body = {
        companyName: newCo.companyName,
        city: newCo.city,
        address: newCo.address,
        notes: newCo.notes || undefined,
        status: 'NEW',
        defaultBranchId: defaultBranchId || undefined
      };
      if (newCo.primaryName.trim() && newCo.primaryPhone.trim()) {
        body.primaryContact = { name: newCo.primaryName, phone: newCo.primaryPhone };
      }
      await postCompanyAccount(body);
      setMsg('Компания создана');
      setNewCo({
        companyName: '',
        city: '',
        address: '',
        notes: '',
        primaryName: '',
        primaryPhone: ''
      });
      loadCompanies();
      fetchCorporateLeads({})
        .then((d) =>
          setSummary({
            leadCountsByStatus: d?.leadCountsByStatus || {},
            companyCountsByStatus: d?.companyCountsByStatus || {}
          })
        )
        .catch(() => {});
    } catch (e) {
      setErr(e.message || String(e));
    }
  }

  const counts = summary.leadCountsByStatus;
  const coCounts = summary.companyCountsByStatus;

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 960, margin: '0 auto', padding: '16px 14px 40px' }}>
      <h1 style={{ marginTop: 0, fontSize: '1.35rem' }}>B2B · корпоративные обеды</h1>
      <p style={{ color: '#555', fontSize: 14, marginTop: 0 }}>
        Заявки с сайта и ручной ввод. Конвертация в компанию без удаления лида. Повторные заказы — через «Быстрый
        заказ» с привязкой к компании.
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16, fontSize: 12, color: '#444' }}>
        <span style={{ fontWeight: 600 }}>Лиды по статусам:</span>
        {LEAD_STATUSES.map((s) => (
          <span key={s} style={{ padding: '2px 8px', background: '#eee', borderRadius: 6 }}>
            {corporateLeadStatusLabel(s)}: {counts[s] ?? 0}
          </span>
        ))}
        <span style={{ marginLeft: 8, fontWeight: 600 }}>Компании:</span>
        {COMPANY_STATUSES.map((s) => (
          <span key={s} style={{ padding: '2px 8px', background: '#e8f5e9', borderRadius: 6 }}>
            {companyAccountStatusLabel(s)}: {coCounts[s] ?? 0}
          </span>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        <button
          type="button"
          onClick={() => setTab('leads')}
          style={{ padding: '8px 14px', fontWeight: tab === 'leads' ? 700 : 400, cursor: 'pointer' }}
        >
          Заявки (лиды)
        </button>
        <button
          type="button"
          onClick={() => setTab('companies')}
          style={{ padding: '8px 14px', fontWeight: tab === 'companies' ? 700 : 400, cursor: 'pointer' }}
        >
          Компании
        </button>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 14 }}>
        <label style={{ fontSize: 14 }}>
          Статус
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            style={{ display: 'block', marginTop: 4, padding: 6 }}
          >
            <option value="">Все</option>
            {(tab === 'leads' ? LEAD_STATUSES : COMPANY_STATUSES).map((s) => (
              <option key={s} value={s}>
                {tab === 'leads' ? corporateLeadStatusLabel(s) : companyAccountStatusLabel(s)}
              </option>
            ))}
          </select>
        </label>
        <label style={{ fontSize: 14, flex: '1 1 200px' }}>
          Поиск (от 2 симв.)
          <input
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            placeholder="Компания, контакт, телефон…"
            style={{ display: 'block', marginTop: 4, padding: 6, width: '100%', maxWidth: 280 }}
          />
        </label>
        <button type="button" style={{ marginTop: 20, padding: '6px 12px', cursor: 'pointer' }} onClick={() => (tab === 'leads' ? loadLeads() : loadCompanies())}>
          Обновить
        </button>
      </div>

      {err ? (
        <div style={{ color: '#b00020', marginBottom: 12 }} role="alert">
          {err}
        </div>
      ) : null}
      {msg ? (
        <div style={{ color: '#2e7d32', marginBottom: 12 }} role="status">
          {msg}
        </div>
      ) : null}
      {loading ? <p style={{ color: '#666', fontSize: 14 }}>Загрузка…</p> : null}

      {tab === 'leads' ? (
        <>
          <details style={{ ...cardStyle(), marginBottom: 16 }}>
            <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Новая заявка (оператор)</summary>
            <form onSubmit={submitNewLead} style={{ marginTop: 12, display: 'grid', gap: 10, maxWidth: 480 }}>
              <input
                required
                placeholder="Компания"
                value={newLead.companyName}
                onChange={(e) => setNewLead((s) => ({ ...s, companyName: e.target.value }))}
                style={{ padding: 8 }}
              />
              <input
                required
                placeholder="Контакт (ФИО)"
                value={newLead.contactName}
                onChange={(e) => setNewLead((s) => ({ ...s, contactName: e.target.value }))}
                style={{ padding: 8 }}
              />
              <input
                required
                placeholder="Телефон"
                value={newLead.phone}
                onChange={(e) => setNewLead((s) => ({ ...s, phone: e.target.value }))}
                style={{ padding: 8 }}
              />
              <input
                required
                placeholder="Город"
                value={newLead.city}
                onChange={(e) => setNewLead((s) => ({ ...s, city: e.target.value }))}
                style={{ padding: 8 }}
              />
              <input
                required
                placeholder="Адрес доставки (офис)"
                value={newLead.address}
                onChange={(e) => setNewLead((s) => ({ ...s, address: e.target.value }))}
                style={{ padding: 8 }}
              />
              <input
                placeholder="Чел. (оценка)"
                value={newLead.headcountEstimate}
                onChange={(e) => setNewLead((s) => ({ ...s, headcountEstimate: e.target.value }))}
                style={{ padding: 8 }}
              />
              <input
                placeholder="Желаемое время доставки"
                value={newLead.preferredDeliveryTime}
                onChange={(e) => setNewLead((s) => ({ ...s, preferredDeliveryTime: e.target.value }))}
                style={{ padding: 8 }}
              />
              <textarea
                placeholder="Комментарий"
                value={newLead.comment}
                onChange={(e) => setNewLead((s) => ({ ...s, comment: e.target.value }))}
                rows={2}
                style={{ padding: 8 }}
              />
              <button type="submit" style={{ padding: '10px 16px', cursor: 'pointer' }}>
                Сохранить заявку
              </button>
            </form>
          </details>

          {leadsPack.items.map((L) => (
            <div key={L.id} style={cardStyle()}>
              <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 }}>
                <strong>{L.companyName}</strong>
                <span style={{ fontSize: 13, color: '#666' }}>{L.createdAt?.slice(0, 10)}</span>
              </div>
              <div style={{ fontSize: 14, marginTop: 6 }}>
                {L.contactName} · {L.phone} · {orderSourceChannelLabel(L.sourceChannel)}
              </div>
              <div style={{ fontSize: 14, color: '#444', marginTop: 4 }}>
                {L.city}, {L.address}
              </div>
              {L.headcountEstimate != null ? (
                <div style={{ fontSize: 13, marginTop: 4 }}>Оценка команды: ~{L.headcountEstimate} чел.</div>
              ) : null}
              {L.preferredDeliveryTime ? (
                <div style={{ fontSize: 13, marginTop: 2 }}>Время: {L.preferredDeliveryTime}</div>
              ) : null}
              {L.comment ? (
                <div style={{ fontSize: 13, marginTop: 4, color: '#555' }}>{L.comment}</div>
              ) : null}
              <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                <label style={{ fontSize: 13 }}>
                  Статус
                  <select
                    value={L.status}
                    onChange={(e) => saveLeadStatus(L.id, e.target.value)}
                    style={{ marginLeft: 6, padding: 4 }}
                  >
                    {LEAD_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {corporateLeadStatusLabel(s)}
                      </option>
                    ))}
                  </select>
                </label>
                {L.companyAccount ? (
                  <span style={{ fontSize: 13, color: '#2e7d32' }}>
                    → компания: {L.companyAccount.companyName}
                  </span>
                ) : (
                  <>
                    {convertLeadId === L.id ? (
                      <span style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                        <select
                          value={convertBranchId}
                          onChange={(e) => setConvertBranchId(e.target.value)}
                          style={{ padding: 4 }}
                        >
                          {branches.map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.name}
                            </option>
                          ))}
                        </select>
                        <button type="button" style={{ padding: '4px 10px', cursor: 'pointer' }} onClick={() => convertLead(L.id)}>
                          Создать компанию
                        </button>
                        <button type="button" style={{ padding: '4px 10px', cursor: 'pointer' }} onClick={() => setConvertLeadId(null)}>
                          Отмена
                        </button>
                      </span>
                    ) : (
                      <button type="button" style={{ padding: '4px 10px', cursor: 'pointer' }} onClick={() => setConvertLeadId(L.id)}>
                        В компанию
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}
          {!loading && leadsPack.items.length === 0 ? <p style={{ color: '#888' }}>Нет заявок в выборке.</p> : null}
        </>
      ) : (
        <>
          <details style={{ ...cardStyle(), marginBottom: 16 }}>
            <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Новая компания</summary>
            <form onSubmit={submitNewCompany} style={{ marginTop: 12, display: 'grid', gap: 10, maxWidth: 480 }}>
              <input
                required
                placeholder="Название компании"
                value={newCo.companyName}
                onChange={(e) => setNewCo((s) => ({ ...s, companyName: e.target.value }))}
                style={{ padding: 8 }}
              />
              <input
                required
                placeholder="Город"
                value={newCo.city}
                onChange={(e) => setNewCo((s) => ({ ...s, city: e.target.value }))}
                style={{ padding: 8 }}
              />
              <input
                required
                placeholder="Адрес (офис)"
                value={newCo.address}
                onChange={(e) => setNewCo((s) => ({ ...s, address: e.target.value }))}
                style={{ padding: 8 }}
              />
              <textarea
                placeholder="Заметки"
                value={newCo.notes}
                onChange={(e) => setNewCo((s) => ({ ...s, notes: e.target.value }))}
                rows={2}
                style={{ padding: 8 }}
              />
              <input
                placeholder="Первый контакт — имя"
                value={newCo.primaryName}
                onChange={(e) => setNewCo((s) => ({ ...s, primaryName: e.target.value }))}
                style={{ padding: 8 }}
              />
              <input
                placeholder="Первый контакт — телефон"
                value={newCo.primaryPhone}
                onChange={(e) => setNewCo((s) => ({ ...s, primaryPhone: e.target.value }))}
                style={{ padding: 8 }}
              />
              <button type="submit" style={{ padding: '10px 16px', cursor: 'pointer' }}>
                Создать
              </button>
            </form>
          </details>

          {companies.map((C) => (
            <div key={C.id} style={cardStyle()}>
              <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 }}>
                <strong>{C.companyName}</strong>
                <button type="button" style={{ padding: '4px 10px', cursor: 'pointer' }} onClick={() => openOrderFromCompany(C)}>
                  Быстрый заказ
                </button>
              </div>
              <div style={{ fontSize: 14, marginTop: 6 }}>
                {C.city} · {C.address}
              </div>
              {C.defaultBranch ? (
                <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>Точка по умолч.: {C.defaultBranch.name}</div>
              ) : null}
              {C.contacts?.length ? (
                <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 13 }}>
                  {C.contacts.map((c) => (
                    <li key={c.id}>
                      {c.name} · {c.phone}
                    </li>
                  ))}
                </ul>
              ) : (
                <p style={{ fontSize: 13, color: '#888', margin: '8px 0 0' }}>Контакты не добавлены</p>
              )}
              {C.notes ? <div style={{ fontSize: 13, marginTop: 6, color: '#555' }}>{C.notes}</div> : null}
              <div style={{ marginTop: 10 }}>
                <label style={{ fontSize: 13 }}>
                  Статус
                  <select
                    value={C.status}
                    onChange={(e) => saveCompanyStatus(C.id, e.target.value)}
                    style={{ marginLeft: 6, padding: 4 }}
                  >
                    {COMPANY_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {companyAccountStatusLabel(s)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          ))}
          {!loading && companies.length === 0 ? <p style={{ color: '#888' }}>Нет компаний в выборке.</p> : null}
        </>
      )}
    </div>
  );
}
