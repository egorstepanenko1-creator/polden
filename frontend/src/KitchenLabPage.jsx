import { useCallback, useEffect, useState } from 'react';
import {
  createKitchenDish,
  createKitchenDishVersion,
  createKitchenIngredient,
  createKitchenIngredientPrice,
  createKitchenUnit,
  fetchKitchenDishes,
  fetchKitchenDishVersion,
  fetchKitchenDishVersions,
  fetchKitchenIngredients,
  fetchKitchenIngredientPrices,
  fetchKitchenUnits,
  publishKitchenDishVersion,
  putKitchenDishVersionIngredients
} from './api.js';
import { kitchen as kitchenRu, pages, recipeVersionStatusLabel } from './i18n/ru.js';

function cardStyle() {
  return {
    border: '1px solid #e0e0e0',
    borderRadius: 10,
    padding: '14px 16px',
    background: '#fafafa',
    marginBottom: 16
  };
}

function btnStyle(disabled) {
  return {
    padding: '6px 12px',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.6 : 1
  };
}

/** @param {string} [iso] */
function isoToDatetimeLocal(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function KitchenLabPage() {
  const [units, setUnits] = useState([]);
  const [ingredients, setIngredients] = useState([]);
  const [dishes, setDishes] = useState([]);
  const [prices, setPrices] = useState([]);
  const [versions, setVersions] = useState([]);
  const [versionDetail, setVersionDetail] = useState(null);

  const [selIngredientId, setSelIngredientId] = useState('');
  const [selDishId, setSelDishId] = useState('');
  const [selVersionId, setSelVersionId] = useState('');

  const [unitCode, setUnitCode] = useState('');
  const [unitDisplayName, setUnitDisplayName] = useState('');
  const [ingName, setIngName] = useState('');
  const [ingDefaultUnitId, setIngDefaultUnitId] = useState('');
  const [dishName, setDishName] = useState('');

  const [priceKopeks, setPriceKopeks] = useState('100');
  const [priceEffFrom, setPriceEffFrom] = useState(() => isoToDatetimeLocal(new Date().toISOString()));
  const [priceEffToOpen, setPriceEffToOpen] = useState(true);
  const [priceEffTo, setPriceEffTo] = useState('');

  const [compLines, setCompLines] = useState([{ ingredientId: '', quantity: '1', unitId: '' }]);

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');

  const showErr = (e) => {
    setErr(e?.message || String(e));
    setInfo('');
  };

  const refreshUnits = useCallback(() => {
    return fetchKitchenUnits().then(setUnits).catch(showErr);
  }, []);
  const refreshIngredients = useCallback(() => {
    return fetchKitchenIngredients().then(setIngredients).catch(showErr);
  }, []);
  const refreshDishes = useCallback(() => {
    return fetchKitchenDishes().then(setDishes).catch(showErr);
  }, []);

  useEffect(() => {
    setBusy(true);
    setErr('');
    Promise.all([refreshUnits(), refreshIngredients(), refreshDishes()]).finally(() => setBusy(false));
  }, [refreshUnits, refreshIngredients, refreshDishes]);

  useEffect(() => {
    if (!selIngredientId) {
      setPrices([]);
      return;
    }
    fetchKitchenIngredientPrices(selIngredientId)
      .then(setPrices)
      .catch(showErr);
  }, [selIngredientId]);

  useEffect(() => {
    if (!selDishId) {
      setVersions([]);
      return;
    }
    fetchKitchenDishVersions(selDishId)
      .then(setVersions)
      .catch(showErr);
  }, [selDishId]);

  useEffect(() => {
    if (!selVersionId) {
      setVersionDetail(null);
      return;
    }
    fetchKitchenDishVersion(selVersionId)
      .then((v) => {
        setVersionDetail(v);
        if (v.status === 'draft' && Array.isArray(v.lines)) {
          setCompLines(
            v.lines.length
              ? v.lines.map((l) => ({
                  ingredientId: l.ingredientId,
                  quantity: String(l.quantity),
                  unitId: l.unitId
                }))
              : [{ ingredientId: '', quantity: '1', unitId: '' }]
          );
        }
      })
      .catch(showErr);
  }, [selVersionId]);

  const onCreateUnit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      await createKitchenUnit({ code: unitCode.trim(), displayName: unitDisplayName.trim() });
      setUnitCode('');
      setUnitDisplayName('');
      setInfo('Единица создана.');
      await refreshUnits();
    } catch (e) {
      showErr(e);
    } finally {
      setBusy(false);
    }
  };

  const onCreateIngredient = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      const row = await createKitchenIngredient({
        name: ingName.trim(),
        defaultUnitId: ingDefaultUnitId
      });
      setIngName('');
      setInfo('Ингредиент создан.');
      await refreshIngredients();
      setSelIngredientId(row.id);
    } catch (e) {
      showErr(e);
    } finally {
      setBusy(false);
    }
  };

  const onCreatePrice = async (e) => {
    e.preventDefault();
    if (!selIngredientId) return;
    const ing = ingredients.find((i) => i.id === selIngredientId);
    if (!ing) return;
    setBusy(true);
    setErr('');
    try {
      const from = new Date(priceEffFrom);
      if (Number.isNaN(from.getTime())) throw new Error('Некорректная дата начала цены');
      const to =
        !priceEffToOpen && priceEffTo.trim()
          ? new Date(priceEffTo)
          : null;
      if (to && Number.isNaN(to.getTime())) throw new Error('Некорректная дата окончания цены');
      await createKitchenIngredientPrice(selIngredientId, {
        unitId: ing.defaultUnitId,
        pricePerUnitKopeks: Math.floor(Number(priceKopeks)),
        effectiveFrom: from.toISOString(),
        effectiveTo: to ? to.toISOString() : null
      });
      setInfo('Цена добавлена.');
      const p = await fetchKitchenIngredientPrices(selIngredientId);
      setPrices(p);
    } catch (e) {
      showErr(e);
    } finally {
      setBusy(false);
    }
  };

  const onCreateDish = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      const row = await createKitchenDish({ name: dishName.trim() });
      setDishName('');
      setInfo('Блюдо создано.');
      await refreshDishes();
      setSelDishId(row.id);
    } catch (e) {
      showErr(e);
    } finally {
      setBusy(false);
    }
  };

  const onCreateVersion = async (e) => {
    e.preventDefault();
    if (!selDishId) return;
    setBusy(true);
    setErr('');
    try {
      const row = await createKitchenDishVersion(selDishId, {});
      setInfo(`Черновик версии #${row.versionNumber} создан.`);
      const v = await fetchKitchenDishVersions(selDishId);
      setVersions(v);
      setSelVersionId(row.id);
    } catch (e) {
      showErr(e);
    } finally {
      setBusy(false);
    }
  };

  const onSaveComposition = async (e) => {
    e.preventDefault();
    if (!selVersionId || !versionDetail || versionDetail.status !== 'draft') return;
    setBusy(true);
    setErr('');
    try {
      const lines = compLines
        .filter((l) => l.ingredientId.trim())
        .map((l) => ({
          ingredientId: l.ingredientId.trim(),
          quantity: Number(l.quantity),
          unitId: l.unitId.trim()
        }));
      const updated = await putKitchenDishVersionIngredients(selVersionId, lines);
      setVersionDetail(updated);
      setInfo('Состав сохранён.');
    } catch (e) {
      showErr(e);
    } finally {
      setBusy(false);
    }
  };

  const onPublish = async () => {
    if (!selVersionId) return;
    setBusy(true);
    setErr('');
    setInfo('');
    try {
      const data = await publishKitchenDishVersion(selVersionId);
      setVersionDetail(data);
      setInfo(
        `Опубликовано. Себестоимость на момент публикации: ${data.publishedFoodCostKopeks} коп. (${(data.publishedFoodCostKopeks / 100).toLocaleString('ru-RU')} ₽)`
      );
      if (selDishId) {
        const v = await fetchKitchenDishVersions(selDishId);
        setVersions(v);
      }
    } catch (e) {
      showErr(e);
    } finally {
      setBusy(false);
    }
  };

  const selectedIng = ingredients.find((i) => i.id === selIngredientId);
  const isDraft = versionDetail?.status === 'draft';

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 1100, margin: '0 auto', padding: 24 }}>
      <h1 style={{ marginTop: 0 }}>{pages.kitchenLabTitle}</h1>
      <p style={{ color: '#555', marginTop: 0 }}>
        Внутренняя проверка каталога кухни через <code>/api/kitchen/*</code>. Токен — тот же <code>VITE_CRM_TOKEN</code>.
      </p>

      {err ? (
        <div style={{ color: '#b00020', marginBottom: 12, padding: 12, background: '#fff5f5', borderRadius: 8 }} role="alert">
          <strong>Ошибка:</strong> {err}
        </div>
      ) : null}
      {info ? (
        <div style={{ color: '#1b5e20', marginBottom: 12, padding: 12, background: '#e8f5e9', borderRadius: 8 }} role="status">
          {info}
        </div>
      ) : null}
      {busy ? <p style={{ color: '#666', fontSize: 14 }}>Запрос…</p> : null}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
        {/* Units */}
        <section style={cardStyle()} aria-labelledby="kl-units">
          <h2 id="kl-units" style={{ marginTop: 0, fontSize: '1.1rem' }}>
            Единицы измерения
          </h2>
          <ul style={{ fontSize: 13, paddingLeft: 18, maxHeight: 120, overflow: 'auto' }}>
            {units.map((u) => (
              <li key={u.id}>
                <code>{u.code}</code> — {u.displayName}
              </li>
            ))}
          </ul>
          <form onSubmit={onCreateUnit} style={{ marginTop: 12 }}>
            <label style={{ display: 'block', fontSize: 13 }}>
              {kitchenRu.labelUnitCode}
              <input value={unitCode} onChange={(e) => setUnitCode(e.target.value)} style={{ display: 'block', width: '100%', padding: 6, marginTop: 4 }} />
            </label>
            <label style={{ display: 'block', fontSize: 13, marginTop: 8 }}>
              {kitchenRu.labelUnitDisplayName}
              <input
                value={unitDisplayName}
                onChange={(e) => setUnitDisplayName(e.target.value)}
                style={{ display: 'block', width: '100%', padding: 6, marginTop: 4 }}
              />
            </label>
            <button type="submit" disabled={busy} style={{ ...btnStyle(busy), marginTop: 10 }}>
              Создать единицу
            </button>
          </form>
        </section>

        {/* Ingredients */}
        <section style={cardStyle()} aria-labelledby="kl-ing">
          <h2 id="kl-ing" style={{ marginTop: 0, fontSize: '1.1rem' }}>
            Ингредиенты
          </h2>
          <select
            value={selIngredientId}
            onChange={(e) => setSelIngredientId(e.target.value)}
            style={{ width: '100%', padding: 8, marginBottom: 10 }}
          >
            <option value="">— выберите —</option>
            {ingredients.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name} ({i.defaultUnit?.code})
              </option>
            ))}
          </select>
          <form onSubmit={onCreateIngredient}>
            <label style={{ display: 'block', fontSize: 13 }}>
              Название
              <input value={ingName} onChange={(e) => setIngName(e.target.value)} style={{ display: 'block', width: '100%', padding: 6, marginTop: 4 }} />
            </label>
            <label style={{ display: 'block', fontSize: 13, marginTop: 8 }}>
              Базовая единица
              <select
                value={ingDefaultUnitId}
                onChange={(e) => setIngDefaultUnitId(e.target.value)}
                style={{ display: 'block', width: '100%', padding: 6, marginTop: 4 }}
              >
                <option value="">—</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.code} — {u.displayName}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" disabled={busy} style={{ ...btnStyle(busy), marginTop: 10 }}>
              Создать ингредиент
            </button>
          </form>
        </section>

        {/* Prices */}
        <section style={cardStyle()} aria-labelledby="kl-prices">
          <h2 id="kl-prices" style={{ marginTop: 0, fontSize: '1.1rem' }}>
            Цены ингредиента
          </h2>
          {!selIngredientId ? (
            <p style={{ color: '#888', fontSize: 14 }}>Выберите ингредиент слева.</p>
          ) : (
            <>
              <p style={{ fontSize: 13, marginTop: 0 }}>
                Версия 1: цена задаётся в базовой единице ингредиента ({selectedIng?.defaultUnit?.code}).
              </p>
              <ul style={{ fontSize: 12, paddingLeft: 18, maxHeight: 100, overflow: 'auto' }}>
                {prices.map((p) => (
                  <li key={p.id}>
                    {p.pricePerUnitKopeks} коп / ед. · с {p.effectiveFrom}
                    {p.effectiveTo ? ` по ${p.effectiveTo}` : ' · без конца'}
                  </li>
                ))}
              </ul>
              <form onSubmit={onCreatePrice} style={{ marginTop: 8 }}>
                <label style={{ display: 'block', fontSize: 13 }}>
                  Копеек за единицу
                  <input
                    type="number"
                    min={0}
                    value={priceKopeks}
                    onChange={(e) => setPriceKopeks(e.target.value)}
                    style={{ display: 'block', width: '100%', padding: 6, marginTop: 4 }}
                  />
                </label>
                <label style={{ display: 'block', fontSize: 13, marginTop: 8 }}>
                  С (дата/время)
                  <input
                    type="datetime-local"
                    value={priceEffFrom}
                    onChange={(e) => setPriceEffFrom(e.target.value)}
                    style={{ display: 'block', width: '100%', padding: 6, marginTop: 4 }}
                  />
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginTop: 8 }}>
                  <input type="checkbox" checked={priceEffToOpen} onChange={(e) => setPriceEffToOpen(e.target.checked)} />
                  {kitchenRu.priceEffectiveToNull}
                </label>
                {!priceEffToOpen ? (
                  <label style={{ display: 'block', fontSize: 13, marginTop: 8 }}>
                    По (дата/время)
                    <input
                      type="datetime-local"
                      value={priceEffTo}
                      onChange={(e) => setPriceEffTo(e.target.value)}
                      style={{ display: 'block', width: '100%', padding: 6, marginTop: 4 }}
                    />
                  </label>
                ) : null}
                <button type="submit" disabled={busy || !selIngredientId} style={{ ...btnStyle(busy || !selIngredientId), marginTop: 10 }}>
                  Добавить цену
                </button>
              </form>
            </>
          )}
        </section>

        {/* Dishes */}
        <section style={cardStyle()} aria-labelledby="kl-dishes">
          <h2 id="kl-dishes" style={{ marginTop: 0, fontSize: '1.1rem' }}>
            Блюда
          </h2>
          <select
            value={selDishId}
            onChange={(e) => {
              setSelDishId(e.target.value);
              setSelVersionId('');
            }}
            style={{ width: '100%', padding: 8, marginBottom: 10 }}
          >
            <option value="">— выберите блюдо —</option>
            {dishes.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} ({d.versionCount} вер.)
              </option>
            ))}
          </select>
          <form onSubmit={onCreateDish}>
            <label style={{ display: 'block', fontSize: 13 }}>
              Название блюда
              <input value={dishName} onChange={(e) => setDishName(e.target.value)} style={{ display: 'block', width: '100%', padding: 6, marginTop: 4 }} />
            </label>
            <button type="submit" disabled={busy} style={{ ...btnStyle(busy), marginTop: 10 }}>
              Создать блюдо
            </button>
          </form>
        </section>

        {/* Versions */}
        <section style={cardStyle()} aria-labelledby="kl-ver">
          <h2 id="kl-ver" style={{ marginTop: 0, fontSize: '1.1rem' }}>
            Версии рецепта
          </h2>
          {!selDishId ? (
            <p style={{ color: '#888', fontSize: 14 }}>Выберите блюдо.</p>
          ) : (
            <>
              <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 10px' }}>
                {versions.map((v) => (
                  <li key={v.id} style={{ marginBottom: 6 }}>
                    <button
                      type="button"
                      onClick={() => setSelVersionId(v.id)}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        padding: 8,
                        border: '1px solid #ccc',
                        borderRadius: 6,
                        background: selVersionId === v.id ? '#e3f2fd' : '#fff',
                        cursor: 'pointer'
                      }}
                    >
                      №{v.versionNumber} · {recipeVersionStatusLabel(v.status)} · строк: {v.lineCount}
                    </button>
                  </li>
                ))}
              </ul>
              <form onSubmit={onCreateVersion}>
                <button type="submit" disabled={busy} style={btnStyle(busy)}>
                  + Черновик версии
                </button>
              </form>
            </>
          )}
        </section>

        {/* Composition + publish */}
        <section style={{ ...cardStyle(), gridColumn: '1 / -1' }} aria-labelledby="kl-comp">
          <h2 id="kl-comp" style={{ marginTop: 0, fontSize: '1.1rem' }}>
            Версия: состав и публикация
          </h2>
          {!selVersionId || !versionDetail ? (
            <p style={{ color: '#888' }}>Откройте версию кнопкой в списке выше.</p>
          ) : (
            <>
              <p style={{ fontSize: 14 }}>
                <strong>
                  #{versionDetail.versionNumber}
                </strong>{' '}
                · статус: <code>{recipeVersionStatusLabel(versionDetail.status)}</code>
              </p>
              {isDraft ? (
                <form onSubmit={onSaveComposition}>
                  <p style={{ fontSize: 13, color: '#555' }}>Строки: ингредиент и unitId должны совпадать с defaultUnit ингредиента (v1).</p>
                  {compLines.map((line, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 100px 1fr auto',
                        gap: 8,
                        alignItems: 'end',
                        marginBottom: 8
                      }}
                    >
                      <label style={{ fontSize: 12 }}>
                        Ингредиент
                        <select
                          value={line.ingredientId}
                          onChange={(e) => {
                            const id = e.target.value;
                            const ing = ingredients.find((i) => i.id === id);
                            const next = [...compLines];
                            next[idx] = {
                              ...next[idx],
                              ingredientId: id,
                              unitId: ing ? ing.defaultUnitId : ''
                            };
                            setCompLines(next);
                          }}
                          style={{ display: 'block', width: '100%', padding: 6, marginTop: 4 }}
                        >
                          <option value="">—</option>
                          {ingredients.map((i) => (
                            <option key={i.id} value={i.id}>
                              {i.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label style={{ fontSize: 12 }}>
                        Кол-во
                        <input
                          value={line.quantity}
                          onChange={(e) => {
                            const next = [...compLines];
                            next[idx] = { ...next[idx], quantity: e.target.value };
                            setCompLines(next);
                          }}
                          style={{ display: 'block', width: '100%', padding: 6, marginTop: 4 }}
                        />
                      </label>
                      <label style={{ fontSize: 12 }}>
                        unitId
                        <select
                          value={line.unitId}
                          onChange={(e) => {
                            const next = [...compLines];
                            next[idx] = { ...next[idx], unitId: e.target.value };
                            setCompLines(next);
                          }}
                          style={{ display: 'block', width: '100%', padding: 6, marginTop: 4 }}
                        >
                          <option value="">—</option>
                          {units.map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.code}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        type="button"
                        onClick={() => setCompLines(compLines.filter((_, i) => i !== idx))}
                        disabled={compLines.length <= 1}
                        style={btnStyle(compLines.length <= 1)}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => setCompLines([...compLines, { ingredientId: '', quantity: '1', unitId: '' }])}
                    style={{ ...btnStyle(false), marginRight: 8 }}
                  >
                    + Строка
                  </button>
                  <button type="submit" disabled={busy} style={btnStyle(busy)}>
                    Сохранить состав
                  </button>
                </form>
              ) : (
                <ul style={{ fontSize: 14 }}>
                  {versionDetail.lines?.map((l) => (
                    <li key={l.id}>
                      {l.ingredientName} · {l.quantity} {l.unitCode}
                    </li>
                  ))}
                </ul>
              )}
              <div style={{ marginTop: 16 }}>
                <button type="button" onClick={onPublish} disabled={busy || versionDetail.status !== 'draft'} style={btnStyle(busy || versionDetail.status !== 'draft')}>
                  Опубликовать версию
                </button>
                {versionDetail.status !== 'draft' ? (
                  <span style={{ marginLeft: 12, color: '#666', fontSize: 13 }}>Публикация только для черновика.</span>
                ) : null}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
