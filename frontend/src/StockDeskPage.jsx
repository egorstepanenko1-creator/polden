import { useCallback, useEffect, useState } from 'react';
import {
  createKitchenIngredient,
  createStockMovement,
  createStockReceipt,
  fetchBranches,
  fetchKitchenIngredients,
  fetchKitchenUnits,
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

const MOV_TYPE_LABELS = Object.fromEntries(MOVEMENT_TYPES.map(t => [t.value, t.label]));

const TABS = [
  { id: 'receipt', label: 'Поставки' },
  { id: 'balances', label: 'Остатки' },
  { id: 'history', label: 'История' },
  { id: 'manual', label: 'Ручное движение' }
];

function cardStyle(extra) {
  return {
    border: '1px solid #e0e0e0',
    borderRadius: 10,
    padding: '14px 16px',
    background: '#fafafa',
    marginBottom: 16,
    ...extra
  };
}

function fmtBalance(n) {
  if (n == null || Number.isNaN(n)) return '—';
  return Number(n).toLocaleString('ru-RU', { maximumFractionDigits: 6 });
}

function fmtRub(kopeks) {
  return (kopeks / 100).toLocaleString('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 2 });
}

function isoFromDatetimeLocal(s) {
  if (!s) return '';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString();
}

function nowLocalString() {
  const d = new Date();
  const pad = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ── Строка поставки ──
function ReceiptRow({ ingredients, row, onChange, onRemove }) {
  const ing = ingredients.find(i => i.id === row.ingredientId);
  return (
    <tr>
      <td style={{ padding: '4px 6px' }}>
        <select
          value={row.ingredientId}
          onChange={e => onChange({ ...row, ingredientId: e.target.value })}
          style={{ width: '100%', padding: 5, minWidth: 180 }}
        >
          <option value="">— выберите —</option>
          {ingredients.map(i => (
            <option key={i.id} value={i.id}>{i.name}</option>
          ))}
        </select>
      </td>
      <td style={{ padding: '4px 6px', fontSize: 12, color: '#555', whiteSpace: 'nowrap' }}>
        {ing ? ing.defaultUnit?.code || '?' : '—'}
      </td>
      <td style={{ padding: '4px 6px' }}>
        <input
          type="text" inputMode="decimal"
          value={row.quantity}
          onChange={e => onChange({ ...row, quantity: e.target.value })}
          placeholder="0"
          style={{ width: 80, padding: 5 }}
        />
      </td>
      <td style={{ padding: '4px 6px' }}>
        <input
          type="text" inputMode="decimal"
          value={row.priceRub}
          onChange={e => onChange({ ...row, priceRub: e.target.value })}
          placeholder="₽/ед."
          style={{ width: 90, padding: 5 }}
        />
      </td>
      <td style={{ padding: '4px 6px' }}>
        <button type="button" onClick={onRemove}
          style={{ padding: '4px 10px', background: '#fce4ec', border: '1px solid #e57373', borderRadius: 4 }}>
          ✕
        </button>
      </td>
    </tr>
  );
}

function emptyRow() {
  return { _key: Math.random(), ingredientId: '', quantity: '', priceRub: '' };
}

// ── Форма создания нового ингредиента ──
function NewIngredientForm({ onCreated, onCancel }) {
  const [units, setUnits] = useState([]);
  const [name, setName] = useState('');
  const [unitId, setUnitId] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    fetchKitchenUnits()
      .then(list => { setUnits(Array.isArray(list) ? list : []); if (list?.[0]?.id) setUnitId(list[0].id); })
      .catch(() => {});
  }, []);

  const onSave = async (e) => {
    e.preventDefault();
    if (!name.trim()) { setErr('Введите название'); return; }
    if (!unitId) { setErr('Выберите единицу измерения'); return; }
    setSaving(true); setErr('');
    try {
      const ing = await createKitchenIngredient({ name: name.trim(), defaultUnitId: unitId });
      onCreated(ing);
    } catch (e) { setErr(e.message || String(e)); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ background: '#e8f5e9', border: '1px solid #81c784', borderRadius: 8, padding: '12px 16px', marginBottom: 12 }}>
      <strong style={{ fontSize: 13 }}>Новый ингредиент</strong>
      {err && <div style={{ color: '#b00020', fontSize: 12, marginTop: 4 }}>{err}</div>}
      <form onSubmit={onSave} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginTop: 8, flexWrap: 'wrap' }}>
        <label style={{ fontSize: 13 }}>
          Название
          <input value={name} onChange={e => setName(e.target.value)} autoFocus
            style={{ display: 'block', marginTop: 3, padding: '5px 8px', minWidth: 180 }} />
        </label>
        <label style={{ fontSize: 13 }}>
          Единица
          <select value={unitId} onChange={e => setUnitId(e.target.value)}
            style={{ display: 'block', marginTop: 3, padding: '5px 8px' }}>
            {units.map(u => <option key={u.id} value={u.id}>{u.displayName} ({u.code})</option>)}
          </select>
        </label>
        <button type="submit" disabled={saving}
          style={{ padding: '6px 14px', background: '#2e7d32', color: '#fff', border: 'none', borderRadius: 6 }}>
          {saving ? '…' : 'Создать'}
        </button>
        <button type="button" onClick={onCancel}
          style={{ padding: '6px 12px', background: 'none', border: '1px solid #aaa', borderRadius: 6 }}>
          Отмена
        </button>
      </form>
    </div>
  );
}

// ── Вкладка Поставки ──
function ReceiptTab({ branchId, ingredients: initIngredients, onSaved }) {
  const [ingredients, setIngredients] = useState(initIngredients);
  const [showNewIng, setShowNewIng] = useState(false);
  const [rows, setRows] = useState([emptyRow()]);
  const [occurredAtLocal, setOccurredAtLocal] = useState(nowLocalString);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');

  // Sync when parent updates ingredients (initial load)
  useEffect(() => { setIngredients(initIngredients); }, [initIngredients]);

  const handleIngredientCreated = (newIng) => {
    setIngredients(prev => [...prev, newIng].sort((a, b) => a.name.localeCompare(b.name, 'ru')));
    // Auto-add to receipt rows
    setRows(rs => [...rs, { _key: Math.random(), ingredientId: newIng.id, quantity: '', priceRub: '' }]);
    setShowNewIng(false);
  };

  const updateRow = (idx, val) => setRows(rs => rs.map((r, i) => i === idx ? val : r));
  const removeRow = (idx) => setRows(rs => rs.filter((_, i) => i !== idx));
  const addRow = () => setRows(rs => [...rs, emptyRow()]);

  const onSubmit = async (e) => {
    e.preventDefault();
    setErr(''); setInfo('');
    const validRows = rows.filter(r => r.ingredientId);
    if (validRows.length === 0) { setErr('Добавьте хотя бы один ингредиент'); return; }
    for (const r of validRows) {
      const qty = Number(String(r.quantity).replace(',', '.'));
      const price = Number(String(r.priceRub).replace(',', '.'));
      if (!Number.isFinite(qty) || qty <= 0) { setErr('Количество должно быть > 0 для всех строк'); return; }
      if (!Number.isFinite(price) || price < 0) { setErr('Цена не может быть отрицательной'); return; }
    }
    const occurredAt = isoFromDatetimeLocal(occurredAtLocal);
    if (!occurredAt) { setErr('Укажите дату поставки'); return; }

    const items = validRows.map(r => {
      const ing = ingredients.find(i => i.id === r.ingredientId);
      return {
        ingredientId: r.ingredientId,
        unitId: ing.defaultUnitId,
        quantity: Number(String(r.quantity).replace(',', '.')),
        pricePerUnitKopeks: Math.round(Number(String(r.priceRub).replace(',', '.')) * 100)
      };
    });

    setLoading(true);
    try {
      const res = await createStockReceipt({ branchId, items, occurredAt, note: note.trim() || null });
      const lines = res.items.map(it =>
        `${it.ingredientName}: +${it.quantity} ${it.unitCode}, цена ${fmtRub(it.priceKopeks)}/ед., AVCO → ${fmtRub(it.newAvcoKopeks)}/ед.`
      );
      setInfo('Поставка сохранена:\n' + lines.join('\n'));
      setRows([emptyRow()]);
      setNote('');
      onSaved();
    } catch (e) {
      setErr(e.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>Оприходование поставки</h2>
      <p style={{ fontSize: 13, color: '#555', marginTop: 0 }}>
        Записывает поступление и пересчитывает <strong>среднюю цену ингредиента (AVCO)</strong>.
      </p>
      {err && <div style={{ color: '#b00020', padding: 10, background: '#fff5f5', borderRadius: 6, marginBottom: 10, whiteSpace: 'pre-wrap' }}>{err}</div>}
      {info && <div style={{ color: '#1b5e20', padding: 10, background: '#e8f5e9', borderRadius: 6, marginBottom: 10, whiteSpace: 'pre-wrap' }}>{info}</div>}
      {showNewIng && (
        <NewIngredientForm
          onCreated={handleIngredientCreated}
          onCancel={() => setShowNewIng(false)}
        />
      )}
      <form onSubmit={onSubmit}>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 14 }}>
          <label style={{ fontSize: 13 }}>
            Дата поставки
            <input type="datetime-local" value={occurredAtLocal}
              onChange={e => setOccurredAtLocal(e.target.value)}
              style={{ display: 'block', marginTop: 4, padding: 6 }} />
          </label>
          <label style={{ fontSize: 13, flex: 1, minWidth: 200 }}>
            Примечание (поставщик, накладная…)
            <input value={note} onChange={e => setNote(e.target.value)}
              style={{ display: 'block', width: '100%', marginTop: 4, padding: 6 }} />
          </label>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #ccc', background: '#f5f5f5' }}>
                <th style={{ padding: '6px 6px', textAlign: 'left', fontWeight: 500 }}>Ингредиент</th>
                <th style={{ padding: '6px 6px', textAlign: 'left', fontWeight: 500 }}>Ед.</th>
                <th style={{ padding: '6px 6px', textAlign: 'left', fontWeight: 500 }}>Кол-во</th>
                <th style={{ padding: '6px 6px', textAlign: 'left', fontWeight: 500 }}>Цена ₽/ед.</th>
                <th style={{ padding: '6px 6px' }}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <ReceiptRow key={row._key} ingredients={ingredients} row={row}
                  onChange={val => updateRow(idx, val)}
                  onRemove={() => removeRow(idx)} />
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" onClick={addRow}
            style={{ padding: '8px 14px', background: '#e8f5e9', border: '1px solid #81c784', borderRadius: 6 }}>
            + Строка
          </button>
          <button type="button" onClick={() => setShowNewIng(true)}
            style={{ padding: '8px 14px', background: '#e3f2fd', border: '1px solid #64b5f6', borderRadius: 6 }}>
            + Новый ингредиент
          </button>
          <button type="submit" disabled={loading || !branchId}
            style={{ padding: '8px 18px', background: '#1565c0', color: '#fff', border: 'none', borderRadius: 6 }}>
            {loading ? 'Сохраняем…' : 'Сохранить поставку'}
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Вкладка Остатки ──
function BalancesTab({ balances }) {
  const LOW_THRESHOLD = 1; // кг/л — минимум, ниже которого показываем предупреждение
  const critical = balances.filter(r => r.balance <= LOW_THRESHOLD && r.balance > 0);
  const zero = balances.filter(r => r.balance <= 0);

  return (
    <div>
      <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>Текущие остатки</h2>
      {zero.length > 0 && (
        <div style={{ background: '#fce4ec', border: '1px solid #e57373', borderRadius: 6, padding: '8px 12px', marginBottom: 10, fontSize: 13 }}>
          🔴 Нулевой/отрицательный остаток: {zero.map(r => r.ingredientName).join(', ')}
        </div>
      )}
      {critical.length > 0 && (
        <div style={{ background: '#fff9c4', border: '1px solid #f9a825', borderRadius: 6, padding: '8px 12px', marginBottom: 10, fontSize: 13 }}>
          🟡 Мало на складе (≤{LOW_THRESHOLD} ед.): {critical.map(r => r.ingredientName).join(', ')}
        </div>
      )}
      {balances.length === 0 ? (
        <p style={{ color: '#888' }}>Нет движений или нулевые остатки.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #ccc', textAlign: 'left', background: '#f5f5f5' }}>
                <th style={{ padding: '6px 8px' }}>Ингредиент</th>
                <th style={{ padding: '6px 8px' }}>Ед.</th>
                <th style={{ padding: '6px 8px' }}>Остаток</th>
                <th style={{ padding: '6px 8px' }}>Цена/ед.</th>
                <th style={{ padding: '6px 8px' }}>Сумма на складе</th>
              </tr>
            </thead>
            <tbody>
              {balances.map((r) => (
                <tr key={`${r.ingredientId}-${r.unitId}`} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '6px 8px' }}>{r.ingredientName}</td>
                  <td style={{ padding: '6px 8px' }}><code>{r.unitCode}</code></td>
                  <td style={{
                    padding: '6px 8px',
                    fontWeight: 600,
                    color: r.balance < 0 ? '#b00020' : r.balance <= LOW_THRESHOLD ? '#e65100' : undefined
                  }}>
                    {fmtBalance(r.balance)}
                    {r.balance <= 0 ? ' 🔴' : r.balance <= LOW_THRESHOLD ? ' 🟡' : ''}
                  </td>
                  <td style={{ padding: '6px 8px', color: '#666', fontSize: 12 }}>
                    {r.pricePerUnitKopeks ? fmtRub(r.pricePerUnitKopeks) : '—'}
                  </td>
                  <td style={{ padding: '6px 8px', fontWeight: r.totalKopeks ? 500 : 400, color: r.totalKopeks ? '#1b5e20' : '#aaa' }}>
                    {r.totalKopeks ? fmtRub(r.totalKopeks) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Вкладка История ──
function HistoryTab({ movements, ingredients, filterIngredientId, setFilterIngredientId,
  filterDateFrom, setFilterDateFrom, filterDateTo, setFilterDateTo }) {
  return (
    <div>
      <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>История движений</h2>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end', marginBottom: 12 }}>
        <label style={{ fontSize: 13 }}>
          Фильтр по ингредиенту
          <select value={filterIngredientId} onChange={e => setFilterIngredientId(e.target.value)}
            style={{ display: 'block', marginTop: 4, minWidth: 200, padding: 6 }}>
            <option value="">Все</option>
            {ingredients.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
        </label>
        <label style={{ fontSize: 13 }}>
          С
          <input type="datetime-local" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)}
            style={{ display: 'block', marginTop: 4, padding: 6 }} />
        </label>
        <label style={{ fontSize: 13 }}>
          По
          <input type="datetime-local" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)}
            style={{ display: 'block', marginTop: 4, padding: 6 }} />
        </label>
      </div>
      {movements.length === 0 ? (
        <p style={{ color: '#888' }}>Нет записей.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #ccc', textAlign: 'left', background: '#f5f5f5' }}>
                <th style={{ padding: '6px 6px' }}>Когда</th>
                <th style={{ padding: '6px 6px' }}>Тип</th>
                <th style={{ padding: '6px 6px' }}>Ингредиент</th>
                <th style={{ padding: '6px 6px' }}>Кол-во</th>
                <th style={{ padding: '6px 6px' }}>±</th>
                <th style={{ padding: '6px 6px' }}>Цена/ед.</th>
                <th style={{ padding: '6px 6px' }}>Примечание</th>
              </tr>
            </thead>
            <tbody>
              {movements.map(m => (
                <tr key={m.id} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '6px 6px', whiteSpace: 'nowrap' }}>
                    {new Date(m.occurredAt).toLocaleString('ru-RU')}
                  </td>
                  <td style={{ padding: '6px 6px' }}>
                    <span style={{
                      fontSize: 11, padding: '2px 6px', borderRadius: 10,
                      background: m.movementType === 'RECEIPT' ? '#e8f5e9' : m.movementType.includes('CONSUMPTION') ? '#fce4ec' : '#f5f5f5',
                      color: m.movementType === 'RECEIPT' ? '#2e7d32' : m.movementType.includes('CONSUMPTION') ? '#c62828' : '#555'
                    }}>
                      {MOV_TYPE_LABELS[m.movementType] || m.movementType}
                    </span>
                  </td>
                  <td style={{ padding: '6px 6px' }}>{m.ingredientName}</td>
                  <td style={{ padding: '6px 6px' }}>{m.quantity}</td>
                  <td style={{ padding: '6px 6px', fontWeight: 600, color: m.signedQuantity < 0 ? '#b00020' : '#1b5e20' }}>
                    {m.signedQuantity > 0 ? '+' : ''}{m.signedQuantity}
                  </td>
                  <td style={{ padding: '6px 6px', color: '#666' }}>
                    {m.pricePerUnitKopeks ? fmtRub(m.pricePerUnitKopeks) : '—'}
                  </td>
                  <td style={{ padding: '6px 6px', color: '#555' }}>{m.note || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Вкладка Ручное движение ──
function ManualTab({ branchId, ingredients, onSaved }) {
  const [movType, setMovType] = useState('RECEIPT');
  const [formIngredientId, setFormIngredientId] = useState('');
  const [qty, setQty] = useState('1');
  const [occurredAtLocal, setOccurredAtLocal] = useState(nowLocalString);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');

  const selectedIng = ingredients.find(i => i.id === formIngredientId);
  const formUnitId = selectedIng?.defaultUnitId || '';
  const formUnitLabel = selectedIng?.defaultUnit
    ? `${selectedIng.defaultUnit.code} — ${selectedIng.defaultUnit.displayName}`
    : '—';

  const onCreate = async (e) => {
    e.preventDefault();
    if (!branchId || !formIngredientId || !formUnitId) { setErr('Выберите филиал и ингредиент'); return; }
    const qn = Number(String(qty).replace(',', '.'));
    if (!Number.isFinite(qn) || qn <= 0) { setErr('Количество должно быть положительным'); return; }
    const occurredAt = isoFromDatetimeLocal(occurredAtLocal);
    if (!occurredAt) { setErr('Укажите дату/время'); return; }
    setLoading(true); setErr(''); setInfo('');
    try {
      await createStockMovement({ branchId, ingredientId: formIngredientId, unitId: formUnitId,
        movementType: movType, quantity: qn, occurredAt, note: note.trim() || null });
      setInfo('Движение записано.');
      setNote('');
      onSaved();
    } catch (e) { setErr(e.message || String(e)); }
    finally { setLoading(false); }
  };

  return (
    <div>
      <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>Ручное движение</h2>
      {err && <div style={{ color: '#b00020', padding: 10, background: '#fff5f5', borderRadius: 6, marginBottom: 10 }}>{err}</div>}
      {info && <div style={{ color: '#1b5e20', padding: 10, background: '#e8f5e9', borderRadius: 6, marginBottom: 10 }}>{info}</div>}
      <form onSubmit={onCreate} style={{ maxWidth: 460 }}>
        <label style={{ display: 'block', fontSize: 13, marginBottom: 10 }}>
          Тип
          <select value={movType} onChange={e => setMovType(e.target.value)}
            style={{ display: 'block', width: '100%', marginTop: 4, padding: 8 }}>
            {MOVEMENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label} ({t.value})</option>)}
          </select>
        </label>
        <label style={{ display: 'block', fontSize: 13, marginBottom: 10 }}>
          Ингредиент
          <select value={formIngredientId} onChange={e => setFormIngredientId(e.target.value)}
            style={{ display: 'block', width: '100%', marginTop: 4, padding: 8 }}>
            <option value="">— выберите —</option>
            {ingredients.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
        </label>
        <p style={{ fontSize: 12, color: '#555', margin: '0 0 10px' }}>
          Единица: <strong>{formUnitLabel}</strong>
        </p>
        <label style={{ display: 'block', fontSize: 13, marginBottom: 10 }}>
          Количество
          <input type="text" inputMode="decimal" value={qty} onChange={e => setQty(e.target.value)}
            style={{ display: 'block', width: '100%', marginTop: 4, padding: 8 }} />
        </label>
        <label style={{ display: 'block', fontSize: 13, marginBottom: 10 }}>
          Когда
          <input type="datetime-local" value={occurredAtLocal} onChange={e => setOccurredAtLocal(e.target.value)}
            style={{ display: 'block', width: '100%', marginTop: 4, padding: 8 }} />
        </label>
        <label style={{ display: 'block', fontSize: 13, marginBottom: 10 }}>
          Примечание
          <input value={note} onChange={e => setNote(e.target.value)}
            style={{ display: 'block', width: '100%', marginTop: 4, padding: 8 }} />
        </label>
        <button type="submit" disabled={loading || !branchId} style={{ padding: '10px 18px' }}>
          Записать
        </button>
      </form>
    </div>
  );
}

// ── Главный компонент ──
export function StockDeskPage() {
  const [branches, setBranches] = useState([]);
  const [ingredients, setIngredients] = useState([]);
  const [branchId, setBranchId] = useState('');
  const [activeTab, setActiveTab] = useState('receipt');

  const [balances, setBalances] = useState([]);
  const [movements, setMovements] = useState([]);
  const [filterIngredientId, setFilterIngredientId] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    fetchBranches()
      .then(b => { setBranches(Array.isArray(b) ? b : []); if (b?.[0]?.id) setBranchId(b[0].id); })
      .catch(e => setErr(e.message || String(e)));
    fetchKitchenIngredients()
      .then(list => setIngredients(Array.isArray(list) ? list : []))
      .catch(e => setErr(e.message || String(e)));
  }, []);

  const refreshData = useCallback(async () => {
    if (!branchId) return;
    setLoading(true); setErr('');
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
    } catch (e) { setErr(e.message || String(e)); }
    finally { setLoading(false); }
  }, [branchId, filterIngredientId, filterDateFrom, filterDateTo]);

  useEffect(() => { refreshData(); }, [refreshData]);

  const tabBtnStyle = (id) => ({
    padding: '8px 18px',
    border: 'none',
    borderBottom: activeTab === id ? '3px solid #1565c0' : '3px solid transparent',
    background: 'none',
    fontWeight: activeTab === id ? 700 : 400,
    color: activeTab === id ? '#1565c0' : '#555',
    cursor: 'pointer',
    fontSize: 14
  });

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 1100, margin: '0 auto', padding: 24 }}>
      <h1 style={{ marginTop: 0 }}>Склад</h1>

      {err && (
        <div style={{ color: '#b00020', marginBottom: 12, padding: 12, background: '#fff5f5', borderRadius: 8 }} role="alert">
          {err}
        </div>
      )}

      <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <select value={branchId} onChange={e => setBranchId(e.target.value)}
          style={{ padding: '7px 12px', marginRight: 8 }}>
          {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <button type="button" onClick={refreshData} disabled={loading || !branchId}
          style={{ padding: '7px 14px', marginRight: 16 }}>
          {loading ? '…' : 'Обновить'}
        </button>
        <div style={{ borderBottom: '1px solid #e0e0e0', display: 'flex' }}>
          {TABS.map(t => (
            <button key={t.id} type="button" style={tabBtnStyle(t.id)} onClick={() => setActiveTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div style={cardStyle()}>
        {activeTab === 'receipt' && (
          <ReceiptTab branchId={branchId} ingredients={ingredients} onSaved={refreshData} />
        )}
        {activeTab === 'balances' && (
          <BalancesTab balances={balances} />
        )}
        {activeTab === 'history' && (
          <HistoryTab movements={movements} ingredients={ingredients}
            filterIngredientId={filterIngredientId} setFilterIngredientId={setFilterIngredientId}
            filterDateFrom={filterDateFrom} setFilterDateFrom={setFilterDateFrom}
            filterDateTo={filterDateTo} setFilterDateTo={setFilterDateTo} />
        )}
        {activeTab === 'manual' && (
          <ManualTab branchId={branchId} ingredients={ingredients} onSaved={refreshData} />
        )}
      </div>
    </div>
  );
}
