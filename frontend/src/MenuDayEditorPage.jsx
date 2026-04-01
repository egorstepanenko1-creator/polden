import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchBranches,
  fetchKitchenDishes,
  fetchKitchenDishVersions,
  fetchMenuDayItems,
  upsertMenuDayItem
} from './api.js';
import { localTomorrowISO } from './dates.js';

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

/**
 * Брутто-маржа в копейках: price − foodCostKopeksSnapshot (только если снимок есть; иначе null — не выдумываем).
 * @param {{ price?: number, foodCostKopeksSnapshot?: number | null }} row
 */
function rowGrossMarginKopeks(row) {
  if (row.foodCostKopeksSnapshot == null || row.price == null) return null;
  return row.price - row.foodCostKopeksSnapshot;
}

/**
 * @param {{ price?: number, foodCostKopeksSnapshot?: number | null }} row
 */
function rowGrossMarginPct(row) {
  const m = rowGrossMarginKopeks(row);
  if (m === null || row.price == null || row.price <= 0) return null;
  return (m / row.price) * 100;
}

/**
 * Сводка по загруженным слотам (только факты из API, без догадок).
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
  return { label: 'Снимок есть', bg: '#e8f5e9', color: '#1b5e20' };
}

/** Загружает только опубликованные версии блюд (через существующие kitchen endpoints). */
async function loadPublishedVersionOptions() {
  const dishes = await fetchKitchenDishes();
  const out = [];
  for (const d of dishes) {
    const vers = await fetchKitchenDishVersions(d.id);
    for (const v of vers) {
      if (v.status === 'published') {
        out.push({
          id: v.id,
          label: `${d.name} · рецепт v${v.versionNumber}`,
          dishName: d.name,
          versionNumber: v.versionNumber
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
  /** '' = не трогать привязку при сохранении; иначе id или null через отдельный флаг */
  const [editLink, setEditLink] = useState(false);
  const [dishVersionId, setDishVersionId] = useState('');

  const [loading, setLoading] = useState(false);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');
  const [lastSaved, setLastSaved] = useState(null);

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

  const fillFormFromRow = (row) => {
    setPosition(String(row.position));
    setSlotName(row.name);
    setPriceRubles(String((row.price / 100).toFixed(2)));
    setEditLink(false);
    setDishVersionId(row.dishVersionId || '');
    setLastSaved(row);
    setErr('');
  };

  const suggestNewPosition = () => {
    const max = rows.reduce((m, r) => Math.max(m, r.position), 0);
    setPosition(String(max + 1 || 1));
    setSlotName('');
    setPriceRubles('');
    setEditLink(true);
    setDishVersionId('');
    setLastSaved(null);
    setErr('');
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
      setErr('Укажите название блюда в меню');
      return;
    }
    const priceKopeks = kopeksFromRublesInput(priceRubles);
    if (priceKopeks == null) {
      setErr('Некорректная цена продажи (₽)');
      return;
    }

    const body = {
      branchId,
      date: menuDate,
      position: pos,
      name,
      price: priceKopeks
    };
    if (editLink) {
      body.dishVersionId = dishVersionId.trim() || null;
    }

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

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 1180, margin: '0 auto', padding: 24 }}>
      <h1 style={{ marginTop: 0 }}>Меню на день · редактор</h1>
      <p style={{ color: '#555', marginTop: 0 }}>
        Слоты меню для витрины: название и цена продажи; опционально — опубликованная версия рецепта и замороженная себестоимость (как на бэкенде при сохранении).
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
          <button type="button" onClick={refreshPublishedOptions} disabled={loadingOptions} style={{ padding: '8px 16px' }}>
            {loadingOptions ? 'Версии…' : 'Обновить список рецептов'}
          </button>
        </div>
      </div>

      {rows.length > 0 ? (
        <div style={{ ...cardStyle(), background: '#f5f9ff', borderColor: '#bbdefb' }} aria-labelledby="menu-econ-summary">
          <h2 id="menu-econ-summary" style={{ marginTop: 0, fontSize: '1.05rem' }}>
            Экономика меню на дату (загруженные слоты)
          </h2>
          <p style={{ fontSize: 12, color: '#555', marginTop: 0 }}>
            Суммы маржи и снимков — только по строкам, где есть и цена, и замороженный снимок. Без снимка маржу не показываем.
          </p>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
              gap: 12,
              fontSize: 14
            }}
          >
            <div>
              <div style={{ color: '#666', fontSize: 12 }}>Слотов в меню</div>
              <div style={{ fontWeight: 700 }}>{menuSummary.slotCount}</div>
            </div>
            <div>
              <div style={{ color: '#666', fontSize: 12 }}>С привязкой к рецепту</div>
              <div style={{ fontWeight: 700 }}>{menuSummary.linkedCount}</div>
            </div>
            <div>
              <div style={{ color: '#666', fontSize: 12 }}>Без полной экономики</div>
              <div style={{ fontWeight: 700, color: menuSummary.missingEconomicsCount ? '#e65100' : undefined }}>
                {menuSummary.missingEconomicsCount}
              </div>
              <div style={{ fontSize: 11, color: '#888' }}>вручную или рецепт без снимка</div>
            </div>
            <div>
              <div style={{ color: '#666', fontSize: 12 }}>Σ цен продажи</div>
              <div style={{ fontWeight: 700 }}>{rubKopeks(menuSummary.sumSellKopeks)}</div>
            </div>
            <div>
              <div style={{ color: '#666', fontSize: 12 }}>Σ себестоимости (снимки)</div>
              <div style={{ fontWeight: 700 }}>{rubKopeks(menuSummary.sumSnapshotKopeks)}</div>
              <div style={{ fontSize: 11, color: '#888' }}>строк: {menuSummary.snapshotRowCount}</div>
            </div>
            <div>
              <div style={{ color: '#666', fontSize: 12 }}>Σ брутто-маржа</div>
              <div
                style={{
                  fontWeight: 700,
                  color:
                    menuSummary.totalGrossMarginKopeks < 0
                      ? '#b00020'
                      : menuSummary.marginRowCount
                        ? '#1b5e20'
                        : undefined
                }}
              >
                {menuSummary.marginRowCount ? rubKopeks(menuSummary.totalGrossMarginKopeks) : '—'}
              </div>
              <div style={{ fontSize: 11, color: '#888' }}>
                {menuSummary.marginRowCount ? `строк: ${menuSummary.marginRowCount}` : 'нет строк с снимком'}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={cardStyle()}>
          <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>Слоты ({rows.length})</h2>
          {rows.length === 0 ? (
            <p style={{ color: '#888' }}>Нет строк — загрузите или создайте новый слот.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>
                    <th style={{ padding: '8px 6px' }}>#</th>
                    <th style={{ padding: '8px 6px' }}>Название</th>
                    <th style={{ padding: '8px 6px' }}>Цена</th>
                    <th style={{ padding: '8px 6px' }}>Статус</th>
                    <th style={{ padding: '8px 6px' }}>Себест.</th>
                    <th style={{ padding: '8px 6px' }}>Маржа</th>
                    <th style={{ padding: '8px 6px' }}>%</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const state = getRowEconomicsState(r);
                    const badge = economicsBadge(state);
                    const mk = rowGrossMarginKopeks(r);
                    const mp = rowGrossMarginPct(r);
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
                          background: lastSaved?.id === r.id ? '#e3f2fd' : 'transparent',
                          borderLeft:
                            state === 'complete'
                              ? '3px solid #2e7d32'
                              : state === 'linked_no_snapshot'
                                ? '3px solid #fb8c00'
                                : '3px solid #b0bec5'
                        }}
                      >
                        <td style={{ padding: '8px 6px', whiteSpace: 'nowrap' }}>{r.position}</td>
                        <td style={{ padding: '8px 6px', maxWidth: 180 }}>
                          <div style={{ fontWeight: 600 }}>{r.name}</div>
                          {r.dishVersionId ? (
                            <div style={{ fontSize: 11, color: '#555', wordBreak: 'break-all' }}>
                              <code>{r.dishVersionId.slice(0, 10)}…</code>
                            </div>
                          ) : null}
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
                        <td style={{ padding: '8px 6px', whiteSpace: 'nowrap' }}>
                          {r.foodCostKopeksSnapshot != null ? rubKopeks(r.foodCostKopeksSnapshot) : '—'}
                        </td>
                        <td
                          style={{
                            padding: '8px 6px',
                            whiteSpace: 'nowrap',
                            color: mk == null ? '#888' : mk >= 0 ? '#1b5e20' : '#b00020',
                            fontWeight: mk != null ? 600 : 400
                          }}
                        >
                          {mk != null ? rubKopeks(mk) : '—'}
                        </td>
                        <td style={{ padding: '8px 6px', whiteSpace: 'nowrap' }}>{pctFmt(mp)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p style={{ fontSize: 12, color: '#666', marginBottom: 0 }}>
            Строка таблицы — выбрать слот для редактирования справа.
          </p>
          <button type="button" onClick={suggestNewPosition} style={{ marginTop: 12, padding: '8px 12px' }}>
            Новый слот
          </button>
        </div>

        <div style={cardStyle()}>
          <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>Редактирование слота</h2>
          <form onSubmit={onSave}>
            <label style={{ display: 'block', fontSize: 14, marginBottom: 10 }}>
              Позиция (1–99)
              <input
                value={position}
                onChange={(e) => setPosition(e.target.value)}
                style={{ display: 'block', width: '100%', marginTop: 4, padding: 8 }}
              />
            </label>
            <label style={{ display: 'block', fontSize: 14, marginBottom: 10 }}>
              Название в меню
              <input
                value={slotName}
                onChange={(e) => setSlotName(e.target.value)}
                style={{ display: 'block', width: '100%', marginTop: 4, padding: 8 }}
              />
            </label>
            <label style={{ display: 'block', fontSize: 14, marginBottom: 4 }}>
              Цена продажи (₽)
              <input
                value={priceRubles}
                onChange={(e) => setPriceRubles(e.target.value)}
                placeholder="например 130 или 199.50"
                style={{ display: 'block', width: '100%', marginTop: 4, padding: 8 }}
              />
            </label>
            <p style={{ fontSize: 12, color: '#666', margin: '0 0 10px' }}>
              Вводите только рубли (как на ценнике). Перевод в копейки для сервера делает форма сама.
            </p>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, marginBottom: 10 }}>
              <input type="checkbox" checked={editLink} onChange={(e) => setEditLink(e.target.checked)} />
              Задать или сбросить привязку к опубликованному рецепту
            </label>
            {editLink ? (
              <label style={{ display: 'block', fontSize: 14, marginBottom: 10 }}>
                Версия рецепта (только published)
                <select
                  value={dishVersionId}
                  onChange={(e) => setDishVersionId(e.target.value)}
                  style={{ display: 'block', width: '100%', marginTop: 4, padding: 8 }}
                >
                  <option value="">— нет привязки (сбросить снимок) —</option>
                  {publishedOptions.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <p style={{ fontSize: 13, color: '#666', marginTop: 0 }}>
                Если галочка выключена, при сохранении связь с рецептом и снимок себестоимости <strong>не меняются</strong> (удобно править только название/цену).
              </p>
            )}

            <button type="submit" disabled={loading} style={{ padding: '10px 20px', marginTop: 8 }}>
              Сохранить слот
            </button>
          </form>

          {lastSaved ? (
            <div
              style={{
                marginTop: 16,
                padding: 12,
                background: '#fff',
                border: '1px solid #e0e0e0',
                borderRadius: 8,
                fontSize: 14
              }}
            >
              <strong>Экономика после сохранения</strong>
              <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
                <li>
                  Рецепт (dishVersionId):{' '}
                  {lastSaved.dishVersionId ? <code style={{ wordBreak: 'break-all' }}>{lastSaved.dishVersionId}</code> : '—'}
                </li>
                <li>
                  Себестоимость (снимок):{' '}
                  {lastSaved.foodCostKopeksSnapshot != null ? rubKopeks(lastSaved.foodCostKopeksSnapshot) : '—'}
                </li>
                <li>
                  Время снимка:{' '}
                  {lastSaved.foodCostSnapshottedAt
                    ? new Date(lastSaved.foodCostSnapshottedAt).toLocaleString('ru-RU')
                    : '—'}
                </li>
                <li>Цена продажи: {rubKopeks(lastSaved.price)}</li>
                {marginKopeks != null ? (
                  <li style={{ color: marginKopeks >= 0 ? '#1b5e20' : '#b00020' }}>
                    Маржа (брутто): {rubKopeks(marginKopeks)}
                    {marginPctLast != null ? ` (${pctFmt(marginPctLast)})` : null}
                  </li>
                ) : null}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
