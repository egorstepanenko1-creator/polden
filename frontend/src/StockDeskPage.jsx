import { useCallback, useEffect, useState } from 'react';
import {
  createStockMovement,
  fetchBranches,
  fetchKitchenIngredients,
  fetchStockBalances,
  fetchStockMovements
} from './api.js';
import { pages } from './i18n/ru.js';

const MOVEMENT_TYPES = [
  { value: 'OPENING_BALANCE', label: 'Начальный остаток' },
  { value: 'RECEIPT', label: 'Поступление' },
  { value: 'ADJUSTMENT_IN', label: 'Корректировка +' },
  { value: 'ADJUSTMENT_OUT', label: 'Корректировка −' },
  { value: 'WASTE', label: 'Списание / отход' },
  { value: 'PRODUCTION_CONSUMPTION', label: 'Списание по производству' }
];

function cardStyle() {
  return {
    border: '1px solid #e0e0e0',
    borderRadius: 10,
    padding: '14px 16px',
    background: '#fafafa',
    marginBottom: 16
  };
}

function fmtBalance(n) {
  if (n == null || Number.isNaN(n)) return '—';
  return Number(n).toLocaleString('ru-RU', { maximumFractionDigits: 6 });
}

function isoFromDatetimeLocal(s) {
  if (!s) return '';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString();
}

export function StockDeskPage() {
  const [branches, setBranches] = useState([]);
  const [ingredients, setIngredients] = useState([]);
  const [branchId, setBranchId] = useState('');

  const [balances, setBalances] = useState([]);
  const [movements, setMovements] = useState([]);

  const [filterIngredientId, setFilterIngredientId] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  const [movType, setMovType] = useState('RECEIPT');
  const [formIngredientId, setFormIngredientId] = useState('');
  const [qty, setQty] = useState('1');
  const [occurredAtLocal, setOccurredAtLocal] = useState(() => {
    const d = new Date();
    const pad = (x) => String(x).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });
  const [note, setNote] = useState('');

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');

  useEffect(() => {
    fetchBranches()
      .then((b) => {
        setBranches(Array.isArray(b) ? b : []);
        if (b?.[0]?.id) setBranchId(b[0].id);
      })
      .catch((e) => setErr(e.message || String(e)));
    fetchKitchenIngredients()
      .then((list) => setIngredients(Array.isArray(list) ? list : []))
      .catch((e) => setErr(e.message || String(e)));
  }, []);

  const selectedIng = ingredients.find((i) => i.id === formIngredientId);
  const formUnitId = selectedIng?.defaultUnitId || '';
  const formUnitLabel = selectedIng?.defaultUnit
    ? `${selectedIng.defaultUnit.code} — ${selectedIng.defaultUnit.displayName}`
    : '—';

  const refreshData = useCallback(async () => {
    if (!branchId) return;
    setLoading(true);
    setErr('');
    try {
      const balRes = await fetchStockBalances(branchId);
      setBalances(Array.isArray(balRes.balances) ? balRes.balances : []);
      const movFilters = {};
      if (filterIngredientId) movFilters.ingredientId = filterIngredientId;
      const df = isoFromDatetimeLocal(filterDateFrom);
      const dt = isoFromDatetimeLocal(filterDateTo);
      if (df) movFilters.dateFrom = df;
      if (dt) movFilters.dateTo = dt;
      const movList = await fetchStockMovements(branchId, movFilters);
      setMovements(Array.isArray(movList) ? movList : []);
    } catch (e) {
      setErr(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [branchId, filterIngredientId, filterDateFrom, filterDateTo]);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  const onCreate = async (e) => {
    e.preventDefault();
    if (!branchId || !formIngredientId || !formUnitId) {
      setErr('Выберите филиал и ингредиент');
      return;
    }
    const qn = Number(String(qty).replace(',', '.'));
    if (!Number.isFinite(qn) || qn <= 0) {
      setErr('Количество должно быть положительным числом');
      return;
    }
    const occurredAt = isoFromDatetimeLocal(occurredAtLocal);
    if (!occurredAt) {
      setErr('Укажите дату/время операции');
      return;
    }
    setLoading(true);
    setErr('');
    setInfo('');
    try {
      await createStockMovement({
        branchId,
        ingredientId: formIngredientId,
        unitId: formUnitId,
        movementType: movType,
        quantity: qn,
        occurredAt,
        note: note.trim() || null
      });
      setInfo('Движение создано.');
      setNote('');
      await refreshData();
    } catch (e) {
      setErr(e.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 1100, margin: '0 auto', padding: 24 }}>
      <h1 style={{ marginTop: 0 }}>{pages.stockDeskTitle}</h1>
      <p style={{ color: '#555', marginTop: 0 }}>
        Журнал движений и остатки по филиалу. Единица — всегда <strong>базовая единица ингредиента</strong> (как на бэкенде v1). Знак задаётся типом движения, в форме вводится только положительная величина.
      </p>

      {err ? (
        <div style={{ color: '#b00020', marginBottom: 12, padding: 12, background: '#fff5f5', borderRadius: 8 }} role="alert">
          {err}
        </div>
      ) : null}
      {info ? (
        <div style={{ color: '#1b5e20', marginBottom: 12, padding: 12, background: '#e8f5e9', borderRadius: 8 }} role="status">
          {info}
        </div>
      ) : null}

      <div style={cardStyle()}>
        <label style={{ fontSize: 14 }}>
          Филиал
          <select
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
            style={{ display: 'block', marginTop: 4, minWidth: 260, padding: 8 }}
          >
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={() => refreshData()} disabled={loading || !branchId} style={{ marginLeft: 12, padding: '8px 16px' }}>
          {loading ? '…' : 'Обновить'}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={cardStyle()}>
          <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>Текущие остатки</h2>
          {balances.length === 0 ? (
            <p style={{ color: '#888' }}>Нет движений или нулевые остатки.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #ccc', textAlign: 'left' }}>
                    <th style={{ padding: '6px 8px' }}>Ингредиент</th>
                    <th style={{ padding: '6px 8px' }}>Ед.</th>
                    <th style={{ padding: '6px 8px' }}>Остаток</th>
                  </tr>
                </thead>
                <tbody>
                  {balances.map((r) => (
                    <tr key={`${r.ingredientId}-${r.unitId}`} style={{ borderBottom: '1px solid #eee' }}>
                      <td style={{ padding: '6px 8px' }}>{r.ingredientName}</td>
                      <td style={{ padding: '6px 8px' }}>
                        <code>{r.unitCode}</code>
                      </td>
                      <td
                        style={{
                          padding: '6px 8px',
                          fontWeight: 600,
                          color: r.balance < 0 ? '#b00020' : undefined
                        }}
                      >
                        {fmtBalance(r.balance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div style={cardStyle()}>
          <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>Новое движение</h2>
          <form onSubmit={onCreate}>
            <label style={{ display: 'block', fontSize: 13, marginBottom: 10 }}>
              Тип
              <select
                value={movType}
                onChange={(e) => setMovType(e.target.value)}
                style={{ display: 'block', width: '100%', marginTop: 4, padding: 8 }}
              >
                {MOVEMENT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label} ({t.value})
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: 'block', fontSize: 13, marginBottom: 10 }}>
              Ингредиент
              <select
                value={formIngredientId}
                onChange={(e) => setFormIngredientId(e.target.value)}
                style={{ display: 'block', width: '100%', marginTop: 4, padding: 8 }}
              >
                <option value="">— выберите —</option>
                {ingredients.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </select>
            </label>
            <p style={{ fontSize: 12, color: '#555', margin: '0 0 10px' }}>
              Единица (фикс.): <strong>{formUnitLabel}</strong>
            </p>
            <label style={{ display: 'block', fontSize: 13, marginBottom: 10 }}>
              Количество &gt; 0 (величина)
              <input
                type="text"
                inputMode="decimal"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                style={{ display: 'block', width: '100%', marginTop: 4, padding: 8 }}
              />
            </label>
            <label style={{ display: 'block', fontSize: 13, marginBottom: 10 }}>
              Когда (фактически)
              <input
                type="datetime-local"
                value={occurredAtLocal}
                onChange={(e) => setOccurredAtLocal(e.target.value)}
                style={{ display: 'block', width: '100%', marginTop: 4, padding: 8 }}
              />
            </label>
            <label style={{ display: 'block', fontSize: 13, marginBottom: 10 }}>
              Примечание
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                style={{ display: 'block', width: '100%', marginTop: 4, padding: 8 }}
              />
            </label>
            <button type="submit" disabled={loading || !branchId} style={{ padding: '10px 18px' }}>
              Записать движение
            </button>
          </form>
        </div>
      </div>

      <div style={cardStyle()}>
        <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>История движений</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end', marginBottom: 12 }}>
          <label style={{ fontSize: 13 }}>
            Фильтр по ингредиенту
            <select
              value={filterIngredientId}
              onChange={(e) => setFilterIngredientId(e.target.value)}
              style={{ display: 'block', marginTop: 4, minWidth: 200, padding: 6 }}
            >
              <option value="">Все</option>
              {ingredients.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
          </label>
          <label style={{ fontSize: 13 }}>
            С (дата/время)
            <input
              type="datetime-local"
              value={filterDateFrom}
              onChange={(e) => setFilterDateFrom(e.target.value)}
              style={{ display: 'block', marginTop: 4, padding: 6 }}
            />
          </label>
          <label style={{ fontSize: 13 }}>
            По (дата/время)
            <input
              type="datetime-local"
              value={filterDateTo}
              onChange={(e) => setFilterDateTo(e.target.value)}
              style={{ display: 'block', marginTop: 4, padding: 6 }}
            />
          </label>
        </div>
        {movements.length === 0 ? (
          <p style={{ color: '#888' }}>Нет записей (или не прошли фильтр).</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #ccc', textAlign: 'left' }}>
                  <th style={{ padding: '6px 6px' }}>Когда</th>
                  <th style={{ padding: '6px 6px' }}>Тип</th>
                  <th style={{ padding: '6px 6px' }}>Ингредиент</th>
                  <th style={{ padding: '6px 6px' }}>Qty</th>
                  <th style={{ padding: '6px 6px' }}>±</th>
                  <th style={{ padding: '6px 6px' }}>Примечание</th>
                </tr>
              </thead>
              <tbody>
                {movements.map((m) => (
                  <tr key={m.id} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '6px 6px', whiteSpace: 'nowrap' }}>
                      {new Date(m.occurredAt).toLocaleString('ru-RU')}
                    </td>
                    <td style={{ padding: '6px 6px' }}>
                      <code>{m.movementType}</code>
                    </td>
                    <td style={{ padding: '6px 6px' }}>{m.ingredientName}</td>
                    <td style={{ padding: '6px 6px' }}>{m.quantity}</td>
                    <td
                      style={{
                        padding: '6px 6px',
                        fontWeight: 600,
                        color: m.signedQuantity < 0 ? '#b00020' : '#1b5e20'
                      }}
                    >
                      {m.signedQuantity > 0 ? '+' : ''}
                      {m.signedQuantity}
                    </td>
                    <td style={{ padding: '6px 6px', color: '#555' }}>{m.note || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
