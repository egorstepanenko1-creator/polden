import { useState, useEffect, useCallback } from 'react';

const TOKEN = import.meta.env.VITE_CRM_TOKEN;
const BASE = import.meta.env.VITE_API_BASE || '';

async function apiFetch(path, opts = {}) {
  const { method = 'GET', body } = opts;
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'X-CRM-Token': TOKEN, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const j = await r.json();
  if (!j.ok) throw new Error(j.error?.message || 'API error');
  return j.data;
}

function fmtRub(kopeks) {
  return (kopeks / 100).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₽';
}

/* ──────── IngredientRow — инлайн-редактирование цены и названия ──────── */
function IngredientRow({ ing, unitLabel, priceKopeks, idx, onPriceSet, onRename, onDelete }) {
  const [editPrice, setEditPrice] = useState(false);
  const [priceStr, setPriceStr] = useState('');
  const [editName, setEditName] = useState(false);
  const [nameStr, setNameStr] = useState(ing.name);

  const savePrice = () => {
    const kopeks = Math.round(parseFloat(priceStr.replace(',', '.')) * 100);
    if (!kopeks || kopeks <= 0) { setEditPrice(false); return; }
    onPriceSet(ing.id, kopeks);
    setEditPrice(false);
  };

  const saveName = () => {
    if (nameStr.trim() && nameStr.trim() !== ing.name) onRename(ing.id, nameStr.trim());
    setEditName(false);
  };

  return (
    <tr style={{ borderBottom: '1px solid #eee', background: idx % 2 === 0 ? '#fff' : '#fafafa' }}>
      <td style={{ padding: '8px 12px', fontWeight: 500 }}>
        {editName ? (
          <div style={{ display: 'flex', gap: 4 }}>
            <input autoFocus value={nameStr} onChange={e => setNameStr(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') setEditName(false); }}
              style={{ padding: '3px 7px', borderRadius: 5, border: '1px solid #90caf9', fontSize: 13, width: 160 }} />
            <button type="button" onClick={saveName} style={{ padding: '3px 8px', borderRadius: 5, border: 'none', background: '#1565c0', color: '#fff', cursor: 'pointer' }}>✓</button>
            <button type="button" onClick={() => { setNameStr(ing.name); setEditName(false); }} style={{ padding: '3px 8px', borderRadius: 5, border: '1px solid #ccc', cursor: 'pointer' }}>✕</button>
          </div>
        ) : (
          <span onDoubleClick={() => setEditName(true)} title="Двойной клик — переименовать">{ing.name}</span>
        )}
      </td>
      <td style={{ padding: '8px 12px', color: '#666' }}>{unitLabel}</td>
      <td style={{ padding: '8px 12px' }}>
        {editPrice ? (
          <div style={{ display: 'flex', gap: 4 }}>
            <input autoFocus value={priceStr} onChange={e => setPriceStr(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') savePrice(); if (e.key === 'Escape') setEditPrice(false); }}
              placeholder="₽"
              style={{ width: 80, padding: '3px 7px', borderRadius: 5, border: '1px solid #90caf9', fontSize: 13 }} />
            <button type="button" onClick={savePrice} style={{ padding: '3px 8px', borderRadius: 5, border: 'none', background: '#2e7d32', color: '#fff', cursor: 'pointer' }}>✓</button>
            <button type="button" onClick={() => setEditPrice(false)} style={{ padding: '3px 8px', borderRadius: 5, border: '1px solid #ccc', cursor: 'pointer' }}>✕</button>
          </div>
        ) : (
          <span
            onClick={() => { setPriceStr(priceKopeks ? String(priceKopeks / 100) : ''); setEditPrice(true); }}
            title="Нажмите чтобы изменить цену"
            style={{ cursor: 'pointer', padding: '3px 8px', borderRadius: 5, border: '1px solid transparent',
              color: priceKopeks ? '#333' : '#e53935', fontWeight: priceKopeks ? 600 : 400 }}
            onMouseEnter={e => e.currentTarget.style.border = '1px solid #ccc'}
            onMouseLeave={e => e.currentTarget.style.border = '1px solid transparent'}
          >
            {priceKopeks ? fmtRub(priceKopeks) : '— нет цены'}
          </span>
        )}
      </td>
      <td style={{ padding: '8px 12px' }}>
        <button type="button" onClick={() => { setNameStr(ing.name); setEditName(true); }}
          title="Переименовать"
          style={{ padding: '3px 8px', borderRadius: 5, border: '1px solid #ccc', cursor: 'pointer', fontSize: 12, marginRight: 4 }}>
          ✎
        </button>
        <button type="button" onClick={() => onDelete(ing.id, ing.name)}
          title="Удалить"
          style={{ padding: '3px 8px', borderRadius: 5, border: '1px solid #ef9a9a', cursor: 'pointer', fontSize: 12, color: '#c62828', background: '#fff5f5' }}>
          🗑
        </button>
      </td>
    </tr>
  );
}

/* ──────── ProductsTab ──────── */
function ProductsTab() {
  const [units, setUnits] = useState([]);
  const [ingredients, setIngredients] = useState([]);
  const [prices, setPrices] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [newName, setNewName] = useState('');
  const [newUnit, setNewUnit] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [u, ing] = await Promise.all([
        apiFetch('/api/kitchen/units'),
        apiFetch('/api/kitchen/ingredients')
      ]);
      setUnits(u || []);
      if (!newUnit && u?.length) {
        const kg = u.find(x => x.code === 'kg');
        setNewUnit(kg ? kg.id : u[0].id);
      }
      setIngredients(ing || []);
      const pr = {};
      await Promise.all((ing || []).map(async i => {
        try {
          const rows = (await apiFetch(`/api/kitchen/ingredients/${i.id}/prices`) || [])
            .sort((a, b) => new Date(b.effectiveFrom) - new Date(a.effectiveFrom));
          if (rows[0]) pr[i.id] = rows[0].pricePerUnitKopeks;
        } catch {}
      }));
      setPrices(pr);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!newName.trim() || !newUnit) { setError('Введите название и выберите единицу'); return; }
    setSaving(true); setError(''); setSuccess('');
    try {
      await apiFetch('/api/kitchen/ingredients', { method: 'POST', body: { name: newName.trim(), defaultUnitId: newUnit } });
      setSuccess(`✓ ${newName.trim()} добавлен`);
      setNewName('');
      await load();
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  const handlePriceSet = async (ingId, kopeks) => {
    try {
      await apiFetch(`/api/kitchen/ingredients/${ingId}/price`, { method: 'PUT', body: { pricePerUnitKopeks: kopeks } });
      setPrices(p => ({ ...p, [ingId]: kopeks }));
      setSuccess('✓ Цена сохранена');
      setTimeout(() => setSuccess(''), 2000);
    } catch (e) { setError(e.message); }
  };

  const handleRename = async (ingId, name) => {
    try {
      await apiFetch(`/api/kitchen/ingredients/${ingId}`, { method: 'PATCH', body: { name } });
      setIngredients(prev => prev.map(i => i.id === ingId ? { ...i, name } : i));
    } catch (e) { setError(e.message); }
  };

  const handleDelete = async (ingId) => {
    try {
      await apiFetch(`/api/kitchen/ingredients/${ingId}`, { method: 'PATCH', body: { active: false } });
      setIngredients(prev => prev.filter(i => i.id !== ingId));
      setConfirmDelete(null);
    } catch (e) { setError(e.message); }
  };

  const unitLabel = (unitId) => {
    const u = units.find(x => x.id === unitId);
    return u ? `${u.displayName} (${u.code})` : '';
  };

  const visible = ingredients.filter(i => i.active !== false);

  return (
    <div>
      <h2 style={{ margin: '0 0 12px' }}>Продукты</h2>
      <p style={{ color: '#888', fontSize: 13, marginBottom: 16 }}>
        Нажмите на цену — изменить. Двойной клик на название — переименовать.
      </p>

      <form onSubmit={handleAdd} style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', padding: '12px 14px', background: '#f0f7f2', borderRadius: 10, border: '1px solid #c8e6c9' }}>
        <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Название продукта"
          style={{ flex: 2, minWidth: 160, padding: '8px 12px', borderRadius: 7, border: '1px solid #ccc', fontSize: 14 }} />
        <select value={newUnit} onChange={e => setNewUnit(e.target.value)}
          style={{ padding: '8px 10px', borderRadius: 7, border: '1px solid #ccc', fontSize: 14 }}>
          {units.map(u => <option key={u.id} value={u.id}>{u.displayName} ({u.code})</option>)}
        </select>
        <button type="submit" disabled={saving}
          style={{ padding: '8px 18px', borderRadius: 7, border: 'none', background: '#2e7d32', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 14 }}>
          {saving ? '…' : '+ Добавить'}
        </button>
      </form>

      {error && <p style={{ color: '#e53935', marginBottom: 10 }}>{error}</p>}
      {success && <p style={{ color: '#2e7d32', marginBottom: 10 }}>{success}</p>}

      {confirmDelete && (
        <div style={{ background: '#fff3e0', border: '1px solid #ffb74d', borderRadius: 8, padding: '10px 14px', marginBottom: 12, display: 'flex', gap: 10, alignItems: 'center' }}>
          <span>Удалить <strong>{confirmDelete.name}</strong>?</span>
          <button onClick={() => handleDelete(confirmDelete.id)} style={{ padding: '5px 14px', background: '#c62828', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>Удалить</button>
          <button onClick={() => setConfirmDelete(null)} style={{ padding: '5px 12px', border: '1px solid #ccc', borderRadius: 6, cursor: 'pointer' }}>Отмена</button>
        </div>
      )}

      {loading ? <p style={{ color: '#888' }}>Загрузка…</p> : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ background: '#f5f5f5', borderBottom: '2px solid #ddd' }}>
              <th style={{ textAlign: 'left', padding: '10px 12px' }}>Продукт</th>
              <th style={{ textAlign: 'left', padding: '10px 12px' }}>Ед.</th>
              <th style={{ textAlign: 'left', padding: '10px 12px' }}>Цена / ед. (нажмите чтобы изменить)</th>
              <th style={{ padding: '10px 12px' }}></th>
            </tr>
          </thead>
          <tbody>
            {visible.map((ing, idx) => (
              <IngredientRow
                key={ing.id}
                ing={ing}
                idx={idx}
                unitLabel={unitLabel(ing.defaultUnitId)}
                priceKopeks={prices[ing.id]}
                onPriceSet={handlePriceSet}
                onRename={handleRename}
                onDelete={(id, name) => setConfirmDelete({ id, name })}
              />
            ))}
          </tbody>
        </table>
      )}
      <p style={{ marginTop: 12, color: '#aaa', fontSize: 12 }}>Всего: {visible.length} продуктов</p>
    </div>
  );
}

/* ──────── RecipeLine — строка рецепта (режим просмотра/редактирования) ──────── */
function RecipeLine({ line, idx, editMode, units, onQtyChange, onRemove }) {
  const [qtyStr, setQtyStr] = useState(String(line.qty));

  useEffect(() => { setQtyStr(String(line.qty)); }, [line.qty]);

  const qty = parseFloat(line.qty) || 0;
  const displayQty = qty >= 1 ? qty.toFixed(3).replace(/\.?0+$/, '') : (qty * 1000).toFixed(0) + ' г';

  if (!editMode) {
    return (
      <tr style={{ borderBottom: '1px solid #eee' }}>
        <td style={{ padding: '8px 12px' }}>{line.ingredientName}</td>
        <td style={{ padding: '8px 12px', textAlign: 'right' }}>{displayQty}</td>
        <td style={{ padding: '8px 12px', color: '#666' }}>{line.unitCode}</td>
        <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 500 }}>
          {line.lineCost > 0 ? fmtRub(line.lineCost) : '—'}
        </td>
      </tr>
    );
  }

  return (
    <tr style={{ borderBottom: '1px solid #eee', background: idx % 2 === 0 ? '#fff' : '#fafafa' }}>
      <td style={{ padding: '6px 12px' }}>{line.ingredientName}</td>
      <td style={{ padding: '6px 8px', textAlign: 'right' }}>
        <input
          value={qtyStr}
          onChange={e => { setQtyStr(e.target.value); onQtyChange(line.ingredientId, e.target.value); }}
          style={{ width: 70, padding: '4px 6px', borderRadius: 5, border: '1px solid #ccc', fontSize: 13, textAlign: 'right' }}
        />
      </td>
      <td style={{ padding: '6px 8px', color: '#666', fontSize: 13 }}>{line.unitCode}</td>
      <td style={{ padding: '6px 8px', textAlign: 'right' }}>
        <button type="button" onClick={() => onRemove(line.ingredientId)}
          style={{ padding: '3px 8px', borderRadius: 5, border: 'none', background: '#ffebee', color: '#c62828', cursor: 'pointer', fontSize: 12 }}>
          ✕
        </button>
      </td>
    </tr>
  );
}

/* ──────── RecipesTab ──────── */
function RecipesTab() {
  const [dishes, setDishes] = useState([]);
  const [selected, setSelected] = useState(null);
  const [version, setVersion] = useState(null);
  const [lines, setLines] = useState([]);
  const [ingredients, setIngredients] = useState([]);
  const [units, setUnits] = useState([]);
  const [prices, setPrices] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');

  // Режим редактирования
  const [editMode, setEditMode] = useState(false);
  const [editLines, setEditLines] = useState([]);  // рабочая копия строк
  const [addIngId, setAddIngId] = useState('');
  const [addQty, setAddQty] = useState('');

  // Цена продажи
  const [salePriceEdit, setSalePriceEdit] = useState('');
  const [salePriceSaving, setSalePriceSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [d, ing, u] = await Promise.all([
          apiFetch('/api/kitchen/dishes'),
          apiFetch('/api/kitchen/ingredients'),
          apiFetch('/api/kitchen/units')
        ]);
        const filtered = (d || []).filter(x =>
          !x.name.includes('demo') && !x.name.includes('Demo') &&
          !x.name.includes('mndf9') && x.active !== false
        );
        setDishes(filtered);
        const activeIng = (ing || []).filter(i => i.active !== false && !i.name.includes('demo') && !i.name.includes('Demo') && !i.name.includes('заглушка') && !i.name.includes('mndf9'));
        setIngredients(activeIng);
        setUnits(u || []);
        const pr = {};
        await Promise.all((ing || []).map(async i => {
          try {
            const rows = (await apiFetch(`/api/kitchen/ingredients/${i.id}/prices`) || [])
              .sort((a, b) => new Date(b.effectiveFrom) - new Date(a.effectiveFrom));
            if (rows[0]) pr[i.id] = { kopeks: rows[0].pricePerUnitKopeks, unitId: rows[0].unitId };
          } catch {}
        }));
        setPrices(pr);
      } catch (e) { setError(e.message); }
      finally { setLoading(false); }
    })();
  }, []);

  const selectDish = async (dish) => {
    setSelected(dish);
    setLines([]);
    setVersion(null);
    setEditMode(false);
    setError('');
    setSuccess('');
    setSalePriceEdit(dish.salePrice ? String(dish.salePrice / 100) : '');
    try {
      const vers = await apiFetch(`/api/kitchen/dishes/${dish.id}/versions`);
      if (vers && vers.length > 0) {
        const v = vers[vers.length - 1];
        setVersion(v);
        const detail = await apiFetch(`/api/kitchen/dish-versions/${v.id}`);
        const mapped = (detail.lines || []).map(l => ({
          ingredientId: l.ingredientId,
          ingredientName: l.ingredientName,
          qty: l.quantity,
          unitId: l.unitId,
          unitCode: l.unitCode
        }));
        setLines(mapped);
      }
    } catch (e) { setError(e.message); }
  };

  const costCalc = (linesArr) => {
    let total = 0;
    for (const l of linesArr) {
      const p = prices[l.ingredientId];
      if (!p) continue;
      const qty = parseFloat(l.qty) || 0;
      total += p.kopeks * qty;
    }
    return total;
  };

  // ── Редактирование рецептуры ──
  const startEdit = async () => {
    // Если нет версии — создаём
    if (!version) {
      try {
        const v = await apiFetch(`/api/kitchen/dishes/${selected.id}/versions`, { method: 'POST', body: {} });
        setVersion(v);
        setEditLines([]);
      } catch (e) { setError(e.message); return; }
    } else {
      setEditLines(lines.map(l => ({ ...l })));
    }
    setEditMode(true);
    setError('');
    setSuccess('');
  };

  const cancelEdit = () => {
    setEditMode(false);
    setEditLines([]);
    setAddIngId('');
    setAddQty('');
  };

  const handleQtyChange = (ingId, val) => {
    setEditLines(prev => prev.map(l => l.ingredientId === ingId ? { ...l, qty: val } : l));
  };

  const handleRemoveLine = (ingId) => {
    setEditLines(prev => prev.filter(l => l.ingredientId !== ingId));
  };

  const handleAddLine = () => {
    if (!addIngId || !addQty) return;
    const qty = parseFloat(addQty.replace(',', '.'));
    if (!qty || qty <= 0) { setError('Введите корректное количество'); return; }
    if (editLines.find(l => l.ingredientId === addIngId)) { setError('Ингредиент уже есть в рецептуре'); return; }
    const ing = ingredients.find(i => i.id === addIngId);
    if (!ing) return;
    const u = units.find(x => x.id === ing.defaultUnitId);
    setEditLines(prev => [...prev, {
      ingredientId: ing.id,
      ingredientName: ing.name,
      qty: String(qty),
      unitId: ing.defaultUnitId,
      unitCode: u ? u.code : ''
    }]);
    setAddIngId('');
    setAddQty('');
    setError('');
  };

  const saveRecipe = async () => {
    if (!version) return;
    setSaving(true); setError(''); setSuccess('');
    try {
      const linesPayload = editLines.map(l => ({
        ingredientId: l.ingredientId,
        unitId: l.unitId,
        quantity: parseFloat(l.qty) || 0
      })).filter(l => l.quantity > 0);
      const detail = await apiFetch(`/api/kitchen/dish-versions/${version.id}/ingredients`, {
        method: 'PUT',
        body: { lines: linesPayload }
      });
      const mapped = (detail.lines || []).map(l => ({
        ingredientId: l.ingredientId,
        ingredientName: l.ingredientName,
        qty: l.quantity,
        unitId: l.unitId,
        unitCode: l.unitCode
      }));
      setLines(mapped);
      setEditMode(false);
      setEditLines([]);
      setAddIngId('');
      setAddQty('');
      setSuccess('✓ Рецептура сохранена');
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  // ── Цена продажи ──
  const saveSalePrice = async () => {
    if (!selected) return;
    const kopeks = Math.round(parseFloat(salePriceEdit.replace(',', '.')) * 100);
    if (!kopeks || kopeks <= 0) { setError('Некорректная цена продажи'); return; }
    setSalePriceSaving(true); setError('');
    try {
      await apiFetch(`/api/kitchen/dishes/${selected.id}`, { method: 'PATCH', body: { salePrice: kopeks } });
      setDishes(prev => prev.map(d => d.id === selected.id ? { ...d, salePrice: kopeks } : d));
      setSelected(prev => ({ ...prev, salePrice: kopeks }));
      setSuccess('✓ Цена сохранена');
    } catch (e) { setError(e.message); }
    finally { setSalePriceSaving(false); }
  };

  const displayLines = editMode ? editLines : lines;
  const costKopeks = costCalc(displayLines);
  const saleKopeks = selected?.salePrice || 0;
  const margin = saleKopeks > 0 ? saleKopeks - costKopeks : null;
  const marginPct = margin != null && saleKopeks > 0 ? Math.round((margin / saleKopeks) * 100) : null;

  // Ингредиенты доступные для добавления (не уже в рецептуре)
  const availableIng = ingredients.filter(i => !editLines.find(l => l.ingredientId === i.id));

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 20 }}>
      {/* Список блюд */}
      <div>
        <h2 style={{ margin: '0 0 12px' }}>📋 Блюда</h2>
        {loading && <p style={{ color: '#888' }}>Загрузка…</p>}
        <div style={{ border: '1px solid #e0e0e0', borderRadius: 10, overflow: 'hidden', maxHeight: '70vh', overflowY: 'auto' }}>
          {dishes.map(d => (
            <button key={d.id} type="button" onClick={() => selectDish(d)}
              style={{
                width: '100%', textAlign: 'left', padding: '10px 14px',
                border: 'none', borderBottom: '1px solid #eee',
                background: selected?.id === d.id ? '#e8f0eb' : '#fff',
                cursor: 'pointer', fontSize: 14,
                fontWeight: selected?.id === d.id ? 700 : 400,
                color: selected?.id === d.id ? '#2e7d32' : '#333'
              }}>
              {d.name}
              {d.category && <span style={{ color: '#aaa', fontSize: 11, marginLeft: 6 }}>{d.category}</span>}
            </button>
          ))}
          {!loading && dishes.length === 0 && <p style={{ padding: 16, color: '#888', fontSize: 13 }}>Блюд нет.</p>}
        </div>
      </div>

      {/* Правая панель */}
      <div>
        {selected ? (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
              <div>
                <h2 style={{ margin: '0 0 4px' }}>{selected.name}</h2>
                {selected.category && <p style={{ color: '#888', margin: 0, fontSize: 13 }}>{selected.category}</p>}
              </div>
              {!editMode && (
                <button type="button" onClick={startEdit}
                  style={{ padding: '8px 16px', borderRadius: 7, border: '1px solid #2e7d32', background: '#fff', color: '#2e7d32', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>
                  ✏️ Редактировать
                </button>
              )}
            </div>

            {/* Цена продажи */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, padding: '10px 14px', background: '#f8f8f8', borderRadius: 8, border: '1px solid #e0e0e0' }}>
              <span style={{ fontSize: 13, color: '#555', fontWeight: 500 }}>Цена продажи:</span>
              <input
                value={salePriceEdit}
                onChange={e => setSalePriceEdit(e.target.value)}
                placeholder="напр. 120"
                style={{ width: 80, padding: '5px 8px', borderRadius: 6, border: '1px solid #ccc', fontSize: 13 }}
                onKeyDown={e => e.key === 'Enter' && saveSalePrice()}
              />
              <span style={{ fontSize: 13, color: '#666' }}>₽</span>
              <button type="button" onClick={saveSalePrice} disabled={salePriceSaving}
                style={{ padding: '5px 12px', borderRadius: 6, border: 'none', background: '#1565c0', color: '#fff', cursor: 'pointer', fontSize: 12 }}>
                {salePriceSaving ? '…' : 'Сохранить'}
              </button>
              {saleKopeks > 0 && <span style={{ fontSize: 12, color: '#888' }}>текущая: {fmtRub(saleKopeks)}</span>}
            </div>

            {/* Бейджи себестоимости / маржи */}
            {costKopeks > 0 && (
              <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
                <span style={{ background: '#fff3e0', padding: '6px 14px', borderRadius: 8, fontWeight: 600, fontSize: 14 }}>
                  Себестоимость: {fmtRub(costKopeks)}
                </span>
                {margin != null ? (
                  <span style={{ background: margin >= 0 ? '#e8f5e9' : '#ffebee', padding: '6px 14px', borderRadius: 8, fontWeight: 600, fontSize: 14 }}>
                    Маржа: {fmtRub(margin)} ({marginPct}%)
                  </span>
                ) : (
                  <span style={{ background: '#f5f5f5', padding: '6px 14px', borderRadius: 8, fontSize: 13, color: '#888' }}>
                    Укажите цену продажи для расчёта маржи
                  </span>
                )}
              </div>
            )}

            {success && <p style={{ color: '#2e7d32', marginBottom: 8, fontSize: 13 }}>{success}</p>}
            {error && <p style={{ color: '#e53935', marginBottom: 8, fontSize: 13 }}>{error}</p>}

            {/* Таблица рецептуры */}
            {displayLines.length > 0 ? (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                <thead>
                  <tr style={{ background: '#f5f5f5', borderBottom: '2px solid #ddd' }}>
                    <th style={{ textAlign: 'left', padding: '8px 12px' }}>Ингредиент</th>
                    <th style={{ textAlign: 'right', padding: '8px 12px' }}>Кол-во</th>
                    <th style={{ textAlign: 'left', padding: '8px 12px' }}>Ед.</th>
                    <th style={{ textAlign: 'right', padding: '8px 12px' }}>{editMode ? '' : 'Стоимость'}</th>
                  </tr>
                </thead>
                <tbody>
                  {displayLines.map((l, i) => {
                    const p = prices[l.ingredientId];
                    const qty = parseFloat(l.qty) || 0;
                    const lineCost = p ? p.kopeks * qty : 0;
                    return (
                      <RecipeLine
                        key={l.ingredientId}
                        line={{ ...l, lineCost }}
                        idx={i}
                        editMode={editMode}
                        units={units}
                        onQtyChange={handleQtyChange}
                        onRemove={handleRemoveLine}
                      />
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <p style={{ color: '#888', fontSize: 14, padding: 16, background: '#fafafa', borderRadius: 10 }}>
                {editMode ? 'Рецептура пуста — добавьте ингредиенты ниже.' : (version ? 'Рецептура пуста.' : 'Рецептура не создана. Нажмите «Редактировать».')}
              </p>
            )}

            {/* Панель редактирования */}
            {editMode && (
              <div style={{ marginTop: 16, padding: 14, background: '#f0f7f2', borderRadius: 10, border: '1px solid #c8e6c9' }}>
                <p style={{ margin: '0 0 10px', fontWeight: 600, fontSize: 13, color: '#2e7d32' }}>+ Добавить ингредиент</p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
                  <select value={addIngId} onChange={e => setAddIngId(e.target.value)}
                    style={{ flex: 2, minWidth: 160, padding: '7px 10px', borderRadius: 7, border: '1px solid #ccc', fontSize: 13 }}>
                    <option value="">— выберите ингредиент —</option>
                    {availableIng.map(i => (
                      <option key={i.id} value={i.id}>{i.name} ({i.defaultUnit?.code || ''})</option>
                    ))}
                  </select>
                  <input value={addQty} onChange={e => setAddQty(e.target.value)} placeholder="Кол-во (кг)"
                    style={{ width: 100, padding: '7px 10px', borderRadius: 7, border: '1px solid #ccc', fontSize: 13 }}
                    onKeyDown={e => e.key === 'Enter' && handleAddLine()}
                  />
                  <button type="button" onClick={handleAddLine}
                    style={{ padding: '7px 14px', borderRadius: 7, border: 'none', background: '#2e7d32', color: '#fff', cursor: 'pointer', fontSize: 13 }}>
                    + Добавить
                  </button>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" onClick={saveRecipe} disabled={saving}
                    style={{ padding: '8px 20px', borderRadius: 7, border: 'none', background: '#1b5e20', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 14 }}>
                    {saving ? '…' : '💾 Сохранить рецептуру'}
                  </button>
                  <button type="button" onClick={cancelEdit}
                    style={{ padding: '8px 16px', borderRadius: 7, border: '1px solid #ccc', background: '#fff', color: '#555', cursor: 'pointer', fontSize: 14 }}>
                    Отмена
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300, color: '#aaa', fontSize: 15 }}>
            ← Выберите блюдо из списка
          </div>
        )}
      </div>

      {!selected && error && <p style={{ color: '#e53935', gridColumn: '1/-1' }}>{error}</p>}
    </div>
  );
}

/* ──────── CostPage ──────── */
export function CostPage() {
  const [tab, setTab] = useState('products');

  return (
    <div style={{ padding: '20px 24px', maxWidth: 1100 }}>
      <h1 style={{ margin: '0 0 20px', color: '#2e7d32' }}>Себестоимость</h1>

      <div style={{ display: 'flex', gap: 0, marginBottom: 24 }}>
        <button type="button" onClick={() => setTab('products')}
          style={{
            padding: '10px 28px', border: '1px solid #ccc', borderRadius: '10px 0 0 10px',
            background: tab === 'products' ? '#2e7d32' : '#fff',
            color: tab === 'products' ? '#fff' : '#333',
            fontWeight: 600, cursor: 'pointer', fontSize: 15
          }}>🥕 Продукты</button>
        <button type="button" onClick={() => setTab('recipes')}
          style={{
            padding: '10px 28px', border: '1px solid #ccc', borderRadius: '0 10px 10px 0',
            background: tab === 'recipes' ? '#2e7d32' : '#fff',
            color: tab === 'recipes' ? '#fff' : '#333',
            fontWeight: 600, cursor: 'pointer', fontSize: 15
          }}>📋 Рецепты</button>
      </div>

      {tab === 'products' ? <ProductsTab /> : <RecipesTab />}
    </div>
  );
}
