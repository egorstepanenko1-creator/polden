import { useCallback, useEffect, useState } from 'react';
import {
  createSupplier,
  createSupplierOffer,
  fetchKitchenIngredients,
  fetchSupplierOffers,
  fetchSuppliers,
  patchSupplier
} from './api.js';

function cardStyle() {
  return {
    border: '1px solid #e0e0e0',
    borderRadius: 10,
    padding: '14px 16px',
    background: '#fafafa',
    marginBottom: 16
  };
}

function isoFromDatetimeLocal(s) {
  if (!s) return '';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString();
}

export function SuppliersPage() {
  const [suppliers, setSuppliers] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [offers, setOffers] = useState([]);
  const [ingredients, setIngredients] = useState([]);

  const [newName, setNewName] = useState('');
  const [newNote, setNewNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');

  const [offerIngId, setOfferIngId] = useState('');
  const [offerPack, setOfferPack] = useState('1');
  const [offerPrice, setOfferPrice] = useState('0');
  const [offerFrom, setOfferFrom] = useState(() => {
    const d = new Date();
    const pad = (x) => String(x).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });
  const [offerTo, setOfferTo] = useState('');
  const [offerNote, setOfferNote] = useState('');

  const refreshSuppliers = useCallback(() => {
    return fetchSuppliers()
      .then((list) => {
        setSuppliers(Array.isArray(list) ? list : []);
        return list;
      })
      .catch((e) => {
        setErr(e.message || String(e));
        return null;
      });
  }, []);

  const refreshOffers = useCallback((sid) => {
    if (!sid) {
      setOffers([]);
      return Promise.resolve();
    }
    return fetchSupplierOffers(sid)
      .then((list) => setOffers(Array.isArray(list) ? list : []))
      .catch((e) => setErr(e.message || String(e)));
  }, []);

  useEffect(() => {
    setLoading(true);
    setErr('');
    Promise.all([refreshSuppliers(), fetchKitchenIngredients().then((ing) => setIngredients(Array.isArray(ing) ? ing : []))])
      .catch((e) => setErr(e.message || String(e)))
      .finally(() => setLoading(false));
  }, [refreshSuppliers]);

  useEffect(() => {
    if (selectedId) refreshOffers(selectedId);
  }, [selectedId, refreshOffers]);

  const selectedIng = ingredients.find((i) => i.id === offerIngId);
  const defaultUnitId = selectedIng?.defaultUnitId || '';

  const onCreateSupplier = async (e) => {
    e.preventDefault();
    setErr('');
    setInfo('');
    const name = newName.trim();
    if (!name) {
      setErr('Укажите название');
      return;
    }
    setLoading(true);
    try {
      const row = await createSupplier({ name, note: newNote.trim() || null });
      setInfo('Поставщик создан.');
      setNewName('');
      setNewNote('');
      await refreshSuppliers();
      if (row?.id) setSelectedId(row.id);
    } catch (err0) {
      setErr(err0.message || String(err0));
    } finally {
      setLoading(false);
    }
  };

  const onToggleActive = async (s) => {
    setErr('');
    try {
      await patchSupplier(s.id, { isActive: !s.isActive });
      await refreshSuppliers();
      setInfo(s.isActive ? 'Поставщик отключён.' : 'Поставщик включён.');
    } catch (err0) {
      setErr(err0.message || String(err0));
    }
  };

  const onCreateOffer = async (e) => {
    e.preventDefault();
    if (!selectedId) {
      setErr('Выберите поставщика');
      return;
    }
    if (!offerIngId || !defaultUnitId) {
      setErr('Выберите ингредиент');
      return;
    }
    const pack = Number(String(offerPack).replace(',', '.'));
    const price = Number(offerPrice);
    const fromIso = isoFromDatetimeLocal(offerFrom);
    if (!fromIso) {
      setErr('Укажите дату начала действия цены');
      return;
    }
    if (!Number.isFinite(pack) || pack <= 0) {
      setErr('Упаковка > 0');
      return;
    }
    if (!Number.isInteger(price) || price < 0) {
      setErr('Цена за упаковку — целое число копеек ≥ 0');
      return;
    }
    setErr('');
    setInfo('');
    setLoading(true);
    try {
      await createSupplierOffer(selectedId, {
        ingredientId: offerIngId,
        unitId: defaultUnitId,
        packQuantity: pack,
        pricePerPackKopeks: price,
        effectiveFrom: fromIso,
        effectiveTo: offerTo.trim() ? isoFromDatetimeLocal(offerTo) : null,
        note: offerNote.trim() || null
      });
      setInfo('Оффер добавлен.');
      setOfferNote('');
      await refreshOffers(selectedId);
    } catch (err0) {
      setErr(err0.message || String(err0));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 960, margin: '0 auto', padding: 24 }}>
      <h1 style={{ marginTop: 0 }}>Поставщики</h1>
      <p style={{ color: '#555', marginTop: 0 }}>
        Справочник и цены в упаковках (базовая единица ингредиента = <code>defaultUnit</code>). Заказы поставщикам не создаются.
      </p>

      {err ? (
        <div style={{ color: '#b00020', marginBottom: 12, padding: 12, background: '#fff5f5', borderRadius: 8 }} role="alert">
          {err}
        </div>
      ) : null}
      {info ? (
        <div style={{ marginBottom: 12, padding: 12, background: '#e8f5e9', borderRadius: 8 }} role="status">
          {info}
        </div>
      ) : null}

      <div style={cardStyle()}>
        <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>Новый поставщик</h2>
        <form onSubmit={onCreateSupplier} style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
          <label style={{ fontSize: 14 }}>
            Название
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              style={{ display: 'block', marginTop: 4, padding: 8, minWidth: 220 }}
            />
          </label>
          <label style={{ fontSize: 14 }}>
            Примечание
            <input
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              style={{ display: 'block', marginTop: 4, padding: 8, minWidth: 200 }}
            />
          </label>
          <button type="submit" disabled={loading} style={{ padding: '8px 16px' }}>
            Создать
          </button>
        </form>
      </div>

      <div style={{ ...cardStyle(), display: 'grid', gridTemplateColumns: 'minmax(200px, 1fr) minmax(320px, 2fr)', gap: 20 }}>
        <div>
          <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>Список</h2>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {suppliers.map((s) => (
              <li key={s.id} style={{ marginBottom: 8 }}>
                <button
                  type="button"
                  onClick={() => setSelectedId(s.id)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: 10,
                    border: selectedId === s.id ? '2px solid #1976d2' : '1px solid #ddd',
                    borderRadius: 8,
                    background: selectedId === s.id ? '#e3f2fd' : '#fff',
                    cursor: 'pointer'
                  }}
                >
                  <strong>{s.name}</strong>
                  {!s.isActive ? <span style={{ color: '#999', marginLeft: 8 }}>(выкл.)</span> : null}
                </button>
                <button type="button" style={{ marginTop: 4, fontSize: 12 }} onClick={() => onToggleActive(s)}>
                  {s.isActive ? 'Отключить' : 'Включить'}
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>Офферы выбранного поставщика</h2>
          {!selectedId ? (
            <p style={{ color: '#888' }}>Выберите поставщика слева.</p>
          ) : (
            <>
              <div style={{ overflowX: 'auto', marginBottom: 16 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #ccc', textAlign: 'left' }}>
                      <th style={{ padding: 6 }}>Ингредиент</th>
                      <th style={{ padding: 6 }}>Упак.</th>
                      <th style={{ padding: 6 }}>Коп/уп</th>
                      <th style={{ padding: 6 }}>С</th>
                      <th style={{ padding: 6 }}>По</th>
                    </tr>
                  </thead>
                  <tbody>
                    {offers.map((o) => (
                      <tr key={o.id} style={{ borderBottom: '1px solid #eee' }}>
                        <td style={{ padding: 6 }}>{o.ingredientName}</td>
                        <td style={{ padding: 6 }}>{o.packQuantity}</td>
                        <td style={{ padding: 6 }}>{o.pricePerPackKopeks}</td>
                        <td style={{ padding: 6, fontSize: 11 }}>{o.effectiveFrom?.slice(0, 10)}</td>
                        <td style={{ padding: 6, fontSize: 11 }}>{o.effectiveTo ? o.effectiveTo.slice(0, 10) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <h3 style={{ fontSize: '0.95rem' }}>Добавить оффер</h3>
              <form onSubmit={onCreateOffer} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <label style={{ fontSize: 14 }}>
                  Ингредиент
                  <select
                    value={offerIngId}
                    onChange={(e) => setOfferIngId(e.target.value)}
                    style={{ display: 'block', marginTop: 4, padding: 8, width: '100%' }}
                  >
                    <option value="">—</option>
                    {ingredients.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.name} ({i.defaultUnit?.code})
                      </option>
                    ))}
                  </select>
                </label>
                {selectedIng ? (
                  <div style={{ fontSize: 12, color: '#666' }}>
                    Единица (v1): <code>{defaultUnitId}</code> {selectedIng.defaultUnit?.displayName}
                  </div>
                ) : null}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                  <label style={{ fontSize: 14 }}>
                    Кол-во в упаковке
                    <input
                      value={offerPack}
                      onChange={(e) => setOfferPack(e.target.value)}
                      type="number"
                      min={0.0001}
                      step="any"
                      style={{ display: 'block', marginTop: 4, padding: 8, width: 140 }}
                    />
                  </label>
                  <label style={{ fontSize: 14 }}>
                    Цена упаковки (коп.)
                    <input
                      value={offerPrice}
                      onChange={(e) => setOfferPrice(e.target.value)}
                      type="number"
                      min={0}
                      step={1}
                      style={{ display: 'block', marginTop: 4, padding: 8, width: 140 }}
                    />
                  </label>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                  <label style={{ fontSize: 14 }}>
                    Действует с
                    <input
                      type="datetime-local"
                      value={offerFrom}
                      onChange={(e) => setOfferFrom(e.target.value)}
                      style={{ display: 'block', marginTop: 4, padding: 8 }}
                    />
                  </label>
                  <label style={{ fontSize: 14 }}>
                    До (необяз.)
                    <input
                      type="datetime-local"
                      value={offerTo}
                      onChange={(e) => setOfferTo(e.target.value)}
                      style={{ display: 'block', marginTop: 4, padding: 8 }}
                    />
                  </label>
                </div>
                <label style={{ fontSize: 14 }}>
                  Примечание
                  <input
                    value={offerNote}
                    onChange={(e) => setOfferNote(e.target.value)}
                    style={{ display: 'block', marginTop: 4, padding: 8, width: '100%' }}
                  />
                </label>
                <button type="submit" disabled={loading} style={{ padding: '10px 18px', alignSelf: 'flex-start' }}>
                  Сохранить оффер
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
