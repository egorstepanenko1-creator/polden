import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchBranches,
  fetchKitchenDishes,
  fetchKitchenDishVersions,
  fetchMenuDayItems,
  upsertMenuDayItem
} from './api.js';
import { localTomorrowISO } from './dates.js';
import {
  dishCategoryGroupKey,
  filterPublishedOptionsBySlot,
  groupPublishedDishOptions,
  menuSlotRoleLabelRu
} from './menuDayDishPickerGroups.js';

function rubKopeks(k) {
  return `${(Number(k || 0) / 100).toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ₽`;
}

function kopeksFromRublesInput(raw) {
  const n = Number(String(raw).replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

function cardStyle() {
  return {
    border: '1px solid #e0e0e0',
    borderRadius: 10,
    padding: '14px 16px',
    background: '#fafafa',
    marginBottom: 16
  };
}

/** @typedef {'manual' | 'linked_no_snapshot' | 'complete'} RowEconomicsState */

/** @param {{ dishVersionId?: string | null, foodCostKopeksSnapshot?: number | null }} row */
function getRowEconomicsState(row) {
  if (!row.dishVersionId) return 'manual';
  if (row.foodCostKopeksSnapshot == null) return 'linked_no_snapshot';
  return 'complete';
}

function rowGrossMarginKopeks(row) {
  if (row.foodCostKopeksSnapshot == null || row.price == null) return null;
  return row.price - row.foodCostKopeksSnapshot;
}

/**
 * @param {Array<{ id: string, position: number, name: string, price: number, dishVersionId?: string | null, foodCostKopeksSnapshot?: number | null }>} rows
 */
function computeMenuDayEconomicsSummary(rows) {
  const slotCount = rows.length;
  const linkedCount = rows.filter((r) => Boolean(r.dishVersionId)).length;
  const missingEconomicsCount = rows.filter((r) => getRowEconomicsState(r) !== 'complete').length;
  const sumSellKopeks = rows.reduce((a, r) => a + (Number(r.price) || 0), 0);
  let sumSnapshotKopeks = 0;
  let snapshotRowCount = 0;
  let totalGrossMarginKopeks = 0;
  let marginRowCount = 0;
  for (const r of rows) {
    if (r.foodCostKopeksSnapshot != null) {
      sumSnapshotKopeks += Number(r.foodCostKopeksSnapshot);
      snapshotRowCount += 1;
    }
    const m = rowGrossMarginKopeks(r);
    if (m != null) {
      totalGrossMarginKopeks += m;
      marginRowCount += 1;
    }
  }
  return {
    slotCount,
    linkedCount,
    missingEconomicsCount,
    sumSellKopeks,
    sumSnapshotKopeks,
    snapshotRowCount,
    totalGrossMarginKopeks,
    marginRowCount
  };
}

function pctFmt(p) {
  if (p === null || Number.isNaN(p)) return '—';
  return `${p.toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
}

function economicsBadge(state) {
  if (state === 'manual') {
    return { label: 'Без рецепта', bg: '#eceff1', color: '#455a64' };
  }
  if (state === 'linked_no_snapshot') {
    return { label: 'Рецепт без снимка', bg: '#fff8e1', color: '#e65100' };
  }
  return { label: 'Ок', bg: '#e8f5e9', color: '#1b5e20' };
}

/** @returns {Promise<Array<{ id: string, label: string, dishName: string, versionNumber: number, sortGroup: string }>>} */
async function loadPublishedVersionOptions() {
  const dishes = await fetchKitchenDishes();
  const out = [];
  for (const d of dishes) {
    const vers = await fetchKitchenDishVersions(d.id);
    const sortGroup = dishCategoryGroupKey(d);
    for (const v of vers) {
      if (v.status === 'published') {
        out.push({
          id: v.id,
          label: `${d.name} · v${v.versionNumber}`,
          dishName: d.name,
          versionNumber: v.versionNumber,
          sortGroup
        });
      }
    }
  }
  out.sort((a, b) => a.label.localeCompare(b.label, 'ru'));
  return out;
}

export function MenuDayEditorPage() {
  const [branches, setBranches] = useState([]);
  const [branchId, setBranchId] = useState('');
  const [menuDate, setMenuDate] = useState(localTomorrowISO);
  const [rows, setRows] = useState([]);
  const [publishedOptions, setPublishedOptions] = useState([]);

  const [position, setPosition] = useState('1');
  const [slotName, setSlotName] = useState('');
  const [priceRubles, setPriceRubles] = useState('');
  const [dishVersionId, setDishVersionId] = useState('');
  /** Показать поле названия вместо подписи с авто-заполнением из рецепта */
  const [titleOverrideActive, setTitleOverrideActive] = useState(false);

  const [loading, setLoading] = useState(false);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');
  const [lastSaved, setLastSaved] = useState(null);

  const posNum = Number(position);
  const filteredOptions = useMemo(
    () => filterPublishedOptionsBySlot(publishedOptions, posNum),
    [publishedOptions, posNum]
  );
  const groupedForSlot = useMemo(() => groupPublishedDishOptions(filteredOptions), [filteredOptions]);

  useEffect(() => {
    fetchBranches()
      .then((b) => {
        setBranches(Array.isArray(b) ? b : []);
        if (b?.[0]?.id) setBranchId(b[0].id);
      })
      .catch((e) => setErr(e.message || String(e)));
  }, []);

  const refreshPublishedOptions = useCallback(() => {
    setLoadingOptions(true);
    loadPublishedVersionOptions()
      .then(setPublishedOptions)
      .catch((e) => setErr(e.message || String(e)))
      .finally(() => setLoadingOptions(false));
  }, []);

  useEffect(() => {
    refreshPublishedOptions();
  }, [refreshPublishedOptions]);

  const loadMenu = useCallback(() => {
    if (!branchId || !menuDate) return;
    setLoading(true);
    setErr('');
    fetchMenuDayItems(branchId, menuDate)
      .then((data) => {
        setRows(Array.isArray(data) ? data : []);
        setInfo('Меню загружено.');
        setLastSaved(null);
      })
      .catch((e) => {
        setErr(e.message || String(e));
        setRows([]);
      })
      .finally(() => setLoading(false));
  }, [branchId, menuDate]);

  const handlePositionChange = (raw) => {
    setPosition(raw);
    const pos = Number(raw);
    if (!Number.isInteger(pos) || pos < 1) return;
    const filtered = filterPublishedOptionsBySlot(publishedOptions, pos);
    if (dishVersionId && !filtered.some((o) => o.id === dishVersionId)) {
      setDishVersionId('');
      setSlotName('');
      setTitleOverrideActive(false);
    }
  };

  const fillFormFromRow = (row) => {
    setPosition(String(row.position));
    setSlotName(row.name);
    setPriceRubles(String((row.price / 100).toFixed(2)));
    setDishVersionId(row.dishVersionId || '');
    setTitleOverrideActive(false);
    setLastSaved(row);
    setErr('');
  };

  const suggestNewPosition = () => {
    const max = rows.reduce((m, r) => Math.max(m, r.position), 0);
    const next = Math.min(max + 1 || 1, 99);
    setPosition(String(next));
    setSlotName('');
    setPriceRubles('');
    setDishVersionId('');
    setTitleOverrideActive(false);
    setLastSaved(null);
    setErr('');
  };

  const onRecipeChange = (id) => {
    setDishVersionId(id);
    setTitleOverrideActive(false);
    const opt = publishedOptions.find((o) => o.id === id);
    if (opt) setSlotName(opt.dishName);
    else setSlotName('');
  };

  const onSave = async (e) => {
    e.preventDefault();
    if (!branchId || !menuDate) return;
    const pos = Number(position);
    if (!Number.isInteger(pos) || pos < 1 || pos > 99) {
      setErr('Позиция: целое число 1…99');
      return;
    }
    const name = slotName.trim();
    if (!name) {
      setErr('Укажите название в меню или выберите рецепт');
      return;
    }
    const priceKopeks = kopeksFromRublesInput(priceRubles);
    if (priceKopeks == null) {
      setErr('Некорректная цена продажи (₽)');
      return;
    }
    if (dishVersionId) {
      const allowed = filterPublishedOptionsBySlot(publishedOptions, pos);
      if (!allowed.some((o) => o.id === dishVersionId)) {
        setErr('Выбранный рецепт не подходит для этого слота по категории');
        return;
      }
    }

    const body = {
      branchId,
      date: menuDate,
      position: pos,
      name,
      price: priceKopeks,
      dishVersionId: dishVersionId.trim() ? dishVersionId.trim() : null
    };

    setLoading(true);
    setErr('');
    try {
      const saved = await upsertMenuDayItem(body);
      setLastSaved(saved);
      setInfo('Слот сохранён.');
      const list = await fetchMenuDayItems(branchId, menuDate);
      setRows(Array.isArray(list) ? list : []);
    } catch (e) {
      setErr(e.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  const marginKopeks =
    lastSaved &&
    lastSaved.dishVersionId &&
    lastSaved.foodCostKopeksSnapshot != null &&
    lastSaved.price != null
      ? lastSaved.price - lastSaved.foodCostKopeksSnapshot
      : null;

  const marginPctLast =
    marginKopeks != null && lastSaved && lastSaved.price > 0 ? (marginKopeks / lastSaved.price) * 100 : null;

  const menuSummary = useMemo(() => computeMenuDayEconomicsSummary(rows), [rows]);

  const slotHint = menuSlotRoleLabelRu(posNum);
  const noRecipesInCategory = filteredOptions.length === 0 && publishedOptions.length > 0;

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 1180, margin: '0 auto', padding: 24 }}>
      <h1 style={{ marginTop: 0 }}>Меню на день</h1>
      <p style={{ color: '#555', marginTop: 0, fontSize: 15 }}>
        Завтрашнее меню: выберите слот → рецепт из списка для этой категории → цена в рублях → сохранить. Название для витрины подставляется из блюда.
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
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
          <label style={{ fontSize: 14 }}>
            Точка
            <select
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              style={{ display: 'block', marginTop: 4, minWidth: 200, padding: 8 }}
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          <label style={{ fontSize: 14 }}>
            Дата меню
            <input
              type="date"
              value={menuDate}
              onChange={(e) => setMenuDate(e.target.value)}
              style={{ display: 'block', marginTop: 4, padding: 8 }}
            />
          </label>
          <button type="button" onClick={loadMenu} disabled={loading || !branchId} style={{ padding: '8px 16px' }}>
            {loading ? '…' : 'Загрузить меню'}
          </button>
          <button
            type="button"
            onClick={refreshPublishedOptions}
            disabled={loadingOptions}
            style={{ padding: '8px 12px', fontSize: 13, color: '#555' }}
          >
            {loadingOptions ? 'Рецепты…' : 'Обновить список рецептов'}
          </button>
        </div>
      </div>

      {rows.length > 0 ? (
        <details style={{ ...cardStyle(), background: '#f8f9fa' }}>
          <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: '1.02rem' }}>
            Экономика меню (для контроля)
          </summary>
          <p style={{ fontSize: 12, color: '#555', marginTop: 8 }}>
            Сводка по загруженным слотам. Детали по строке — после сохранения, ниже в блоке «после сохранения».
          </p>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
              gap: 12,
              fontSize: 14,
              marginTop: 8
            }}
          >
            <div>
              <div style={{ color: '#666', fontSize: 12 }}>Слотов</div>
              <div style={{ fontWeight: 700 }}>{menuSummary.slotCount}</div>
            </div>
            <div>
              <div style={{ color: '#666', fontSize: 12 }}>С рецептом</div>
              <div style={{ fontWeight: 700 }}>{menuSummary.linkedCount}</div>
            </div>
            <div>
              <div style={{ color: '#666', fontSize: 12 }}>Σ цен в меню</div>
              <div style={{ fontWeight: 700 }}>{rubKopeks(menuSummary.sumSellKopeks)}</div>
            </div>
            <div>
              <div style={{ color: '#666', fontSize: 12 }}>Σ маржа (где есть снимок)</div>
              <div style={{ fontWeight: 700 }}>
                {menuSummary.marginRowCount ? rubKopeks(menuSummary.totalGrossMarginKopeks) : '—'}
              </div>
            </div>
          </div>
        </details>
      ) : null}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={cardStyle()}>
          <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>Слоты ({rows.length})</h2>
          {rows.length === 0 ? (
            <p style={{ color: '#888' }}>Пока пусто — загрузите меню или добавьте слот справа.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                <thead>
                  <tr style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>
                    <th style={{ padding: '8px 6px' }}>#</th>
                    <th style={{ padding: '8px 6px' }}>В меню</th>
                    <th style={{ padding: '8px 6px' }}>Цена</th>
                    <th style={{ padding: '8px 6px' }}>Связь</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const state = getRowEconomicsState(r);
                    const badge = economicsBadge(state);
                    return (
                      <tr
                        key={r.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => fillFormFromRow(r)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            fillFormFromRow(r);
                          }
                        }}
                        style={{
                          cursor: 'pointer',
                          borderBottom: '1px solid #eee',
                          background: lastSaved?.id === r.id ? '#e3f2fd' : 'transparent'
                        }}
                      >
                        <td style={{ padding: '8px 6px', whiteSpace: 'nowrap', fontWeight: 600 }}>{r.position}</td>
                        <td style={{ padding: '8px 6px', maxWidth: 220 }}>
                          <div style={{ fontWeight: 600 }}>{r.name}</div>
                        </td>
                        <td style={{ padding: '8px 6px', whiteSpace: 'nowrap' }}>{rubKopeks(r.price)}</td>
                        <td style={{ padding: '8px 6px' }}>
                          <span
                            style={{
                              display: 'inline-block',
                              fontSize: 11,
                              padding: '2px 8px',
                              borderRadius: 999,
                              background: badge.bg,
                              color: badge.color,
                              fontWeight: 600
                            }}
                          >
                            {badge.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p style={{ fontSize: 13, color: '#666', marginBottom: 0 }}>Нажмите строку, чтобы редактировать слот справа.</p>
          <button type="button" onClick={suggestNewPosition} style={{ marginTop: 12, padding: '8px 12px' }}>
            Следующий слот
          </button>
        </div>

        <div style={cardStyle()}>
          <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>Слот: {slotHint}</h2>
          <form onSubmit={onSave}>
            <label style={{ display: 'block', fontSize: 14, marginBottom: 10 }}>
              Номер слота (1–99)
              <input
                value={position}
                onChange={(e) => handlePositionChange(e.target.value)}
                style={{ display: 'block', width: '100%', marginTop: 4, padding: 8 }}
              />
            </label>

            <label style={{ display: 'block', fontSize: 14, marginBottom: 6 }}>
              Рецепт (только подходящая категория)
              <select
                value={dishVersionId}
                onChange={(e) => onRecipeChange(e.target.value)}
                style={{ display: 'block', width: '100%', marginTop: 4, padding: 8 }}
              >
                <option value="">— без рецепта (название вручную) —</option>
                {groupedForSlot.map((g) => (
                  <optgroup key={g.group} label={g.labelRu}>
                    {g.items.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
            {noRecipesInCategory ? (
              <p style={{ fontSize: 12, color: '#e65100', marginTop: 0, marginBottom: 10 }}>
                В этой категории нет опубликованных рецептов. Добавьте блюдо в кухне или выберите слот 10+ для любых категорий.
              </p>
            ) : (
              <p style={{ fontSize: 12, color: '#666', marginTop: 0, marginBottom: 10 }}>
                Для слотов 1–9 список уже отфильтрован. Слот 10 и выше — все категории.
              </p>
            )}

            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Название в меню (витрина)</div>
              {!titleOverrideActive && dishVersionId ? (
                <div>
                  <div
                    style={{
                      padding: '10px 12px',
                      background: '#f0f4f8',
                      borderRadius: 8,
                      fontSize: 15,
                      marginBottom: 8
                    }}
                  >
                    {slotName || '—'}
                  </div>
                  <button
                    type="button"
                    onClick={() => setTitleOverrideActive(true)}
                    style={{ padding: '6px 12px', fontSize: 13 }}
                  >
                    Изменить название
                  </button>
                </div>
              ) : (
                <>
                  <input
                    value={slotName}
                    onChange={(e) => setSlotName(e.target.value)}
                    placeholder="Как видит клиент"
                    style={{ display: 'block', width: '100%', padding: 8 }}
                  />
                  {dishVersionId ? (
                    <button
                      type="button"
                      onClick={() => {
                        setTitleOverrideActive(false);
                        const opt = publishedOptions.find((o) => o.id === dishVersionId);
                        if (opt) setSlotName(opt.dishName);
                      }}
                      style={{ marginTop: 6, padding: '4px 10px', fontSize: 12 }}
                    >
                      Вернуть название из рецепта
                    </button>
                  ) : null}
                </>
              )}
            </div>

            <label style={{ display: 'block', fontSize: 14, marginBottom: 4 }}>
              Цена, ₽
              <input
                value={priceRubles}
                onChange={(e) => setPriceRubles(e.target.value)}
                placeholder="например 130"
                style={{ display: 'block', width: '100%', marginTop: 4, padding: 8 }}
              />
            </label>
            <p style={{ fontSize: 12, color: '#666', margin: '0 0 14px' }}>Только рубли; для сервера пересчёт выполняется сам.</p>

            <button type="submit" disabled={loading} style={{ padding: '12px 22px', fontWeight: 600, fontSize: 15 }}>
              Сохранить слот
            </button>
          </form>

          {lastSaved ? (
            <details style={{ marginTop: 16 }}>
              <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: 14, color: '#555' }}>
                Подробности после сохранения (себестоимость, id)
              </summary>
              <div
                style={{
                  marginTop: 10,
                  padding: 12,
                  background: '#fff',
                  border: '1px solid #e0e0e0',
                  borderRadius: 8,
                  fontSize: 13
                }}
              >
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  <li>
                    Рецепт:{' '}
                    {lastSaved.dishVersionId ? (
                      <code style={{ wordBreak: 'break-all', fontSize: 11 }}>{lastSaved.dishVersionId}</code>
                    ) : (
                      '—'
                    )}
                  </li>
                  <li>
                    Себестоимость (снимок):{' '}
                    {lastSaved.foodCostKopeksSnapshot != null ? rubKopeks(lastSaved.foodCostKopeksSnapshot) : '—'}
                  </li>
                  <li>Цена: {rubKopeks(lastSaved.price)}</li>
                  {marginKopeks != null ? (
                    <li style={{ color: marginKopeks >= 0 ? '#1b5e20' : '#b00020' }}>
                      Маржа: {rubKopeks(marginKopeks)}
                      {marginPctLast != null ? ` (${pctFmt(marginPctLast)})` : null}
                    </li>
                  ) : null}
                </ul>
              </div>
            </details>
          ) : null}
        </div>
      </div>
    </div>
  );
}
