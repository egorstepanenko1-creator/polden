import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchBranches,
  fetchKitchenDishes,
  fetchKitchenDishVersions,
  fetchMenuDayItems,
  upsertMenuDayItem,
  fetchOrderWindow,
  openOrderWindow,
  closeOrderWindow
} from './api.js';

const TOKEN = import.meta.env.VITE_CRM_TOKEN || 'dev';
const BASE = import.meta.env.VITE_API_BASE || '';

// Обновляет salePrice блюда — цена из меню становится "эталонной" везде
async function updateDishSalePrice(dishId, priceKopeks) {
  try {
    await fetch(`${BASE}/api/kitchen/dishes/${dishId}`, {
      method: 'PATCH',
      headers: { 'X-CRM-Token': TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify({ salePrice: priceKopeks })
    });
  } catch {}
}

async function publishMenuToVk(branchId, date) {
  const res = await fetch('/api/vk/publish-menu', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CRM-Token': TOKEN },
    body: JSON.stringify({ branchId, date })
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) throw new Error(json?.error?.message || `HTTP ${res.status}`);
  return json.data;
}
import { localTomorrowISO } from './dates.js';

/* ─── helpers ─── */

function rubFromKopeks(k) {
  return `${Math.round(Number(k || 0) / 100)} ₽`;
}

function kopeksFromRubles(raw) {
  const n = Number(String(raw).replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

/* ─── constants ─── */

const SLOT_COUNT = 9;
const SLOT_LABELS = [
  'Суп 1', 'Суп 2',
  'Горячее 1', 'Горячее 2',
  'Салат 1', 'Салат 2',
  'Допы 1', 'Допы 2', 'Допы 3'
];

// Категория для каждого слота — null = «Допы» (Напиток/Каша/Выпечка)
const SLOT_CATEGORIES = ['Суп','Суп','Горячее','Горячее','Салат','Салат',null,null,null];
const DOPY_CATEGORIES = ['Напиток','Каша','Выпечка'];

const COLORS = {
  bg: '#faf8f3',
  card: '#ffffff',
  cardEmpty: '#f5f0e8',
  accent: '#4a7c59',
  accentLight: '#e8f0eb',
  accentDark: '#3a5f45',
  text: '#2d2d2d',
  textMuted: '#888',
  border: '#e0ddd5',
  danger: '#c62828',
  warning: '#e65100',
  success: '#2e7d32'
};

/* ─── styles ─── */

const pageStyle = {
  fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
  maxWidth: 900,
  margin: '0 auto',
  padding: '20px 16px 40px'
};

const headerStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  flexWrap: 'wrap',
  gap: 12,
  marginBottom: 20
};

const gridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 1fr)',
  gap: 14
};

function slotCardStyle(filled) {
  return {
    background: filled ? COLORS.card : COLORS.cardEmpty,
    border: `2px solid ${filled ? COLORS.accent : COLORS.border}`,
    borderRadius: 14,
    padding: '16px 14px',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    minHeight: 110,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    position: 'relative'
  };
}

const slotLabelStyle = {
  fontSize: 11,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: COLORS.textMuted,
  marginBottom: 6
};

const slotNameStyle = {
  fontSize: 15,
  fontWeight: 600,
  color: COLORS.text,
  lineHeight: 1.3,
  flex: 1
};

const slotPriceStyle = {
  fontSize: 18,
  fontWeight: 700,
  color: COLORS.accent,
  marginTop: 6
};

const emptySlotStyle = {
  fontSize: 28,
  color: COLORS.border,
  textAlign: 'center',
  lineHeight: '60px'
};

const modalOverlayStyle = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.4)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000
};

const modalStyle = {
  background: '#fff',
  borderRadius: 16,
  padding: '24px 20px',
  maxWidth: 520,
  width: '95%',
  maxHeight: '80vh',
  overflowY: 'auto',
  boxShadow: '0 12px 40px rgba(0,0,0,0.15)'
};

const btnPrimary = {
  background: COLORS.accent,
  color: '#fff',
  border: 'none',
  borderRadius: 10,
  padding: '10px 24px',
  fontSize: 15,
  fontWeight: 600,
  cursor: 'pointer'
};

const btnSecondary = {
  background: 'transparent',
  color: COLORS.accent,
  border: `1px solid ${COLORS.accent}`,
  borderRadius: 10,
  padding: '8px 18px',
  fontSize: 14,
  fontWeight: 500,
  cursor: 'pointer'
};

const btnDanger = {
  background: 'transparent',
  color: COLORS.danger,
  border: `1px solid ${COLORS.danger}`,
  borderRadius: 8,
  padding: '6px 14px',
  fontSize: 13,
  cursor: 'pointer'
};

const inputStyle = {
  display: 'block',
  width: '100%',
  padding: '10px 12px',
  fontSize: 15,
  border: `1px solid ${COLORS.border}`,
  borderRadius: 10,
  boxSizing: 'border-box',
  marginTop: 4
};

const searchInputStyle = {
  ...inputStyle,
  marginBottom: 12,
  background: COLORS.accentLight
};

/* ─── Dish Picker Modal ─── */

function DishPickerModal({ open, slotIndex, currentName, currentPrice, catalogDishes, onSave, onClear, onClose }) {
  const [search, setSearch] = useState('');
  const [manualName, setManualName] = useState(currentName || '');
  const [manualPrice, setManualPrice] = useState(currentPrice ? String(Math.round(currentPrice / 100)) : '');
  const [mode, setMode] = useState('catalog'); // 'catalog' | 'manual'
  const [pendingDish, setPendingDish] = useState(null); // { name, salePrice, versionId }
  const [pendingPrice, setPendingPrice] = useState('');

  useEffect(() => {
    if (open) {
      setSearch('');
      setManualName(currentName || '');
      setManualPrice(currentPrice ? String(Math.round(currentPrice / 100)) : '');
      setMode(catalogDishes.length > 0 ? 'catalog' : 'manual');
      setPendingDish(null);
      setPendingPrice('');
    }
  }, [open, currentName, currentPrice, catalogDishes.length]);

  if (!open) return null;

  // Фильтрация по категории слота
  const slotCat = SLOT_CATEGORIES[slotIndex]; // null = Допы
  const categoryFiltered = catalogDishes.filter(d => {
    if (!d.category) return false; // блюда без категории не показываем
    if (slotCat === null) return DOPY_CATEGORIES.includes(d.category);
    return d.category === slotCat;
  });

  const q = search.toLowerCase().trim();
  const filtered = categoryFiltered.filter(d =>
    !q || d.name.toLowerCase().includes(q)
  );

  const categoryLabel = slotCat || 'Допы';

  function handleSelectFromCatalog(d) {
    setPendingDish(d);
    setPendingPrice(d.salePrice ? String(Math.round(d.salePrice / 100)) : '');
  }

  function handleConfirmPending() {
    if (!pendingDish) return;
    const priceK = kopeksFromRubles(pendingPrice) ?? 0;
    // Если цена изменилась — сохраняем как новую эталонную для блюда
    if (priceK > 0 && priceK !== pendingDish.salePrice) {
      updateDishSalePrice(pendingDish.id, priceK);
    }
    onSave({ name: pendingDish.name, priceKopeks: priceK, dishVersionId: pendingDish.versionId || null });
  }

  function handleManualSave() {
    const name = manualName.trim();
    if (!name) return;
    const priceK = kopeksFromRubles(manualPrice) ?? 0;
    onSave({ name, priceKopeks: priceK, dishVersionId: null });
  }

  return (
    <div style={modalOverlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 18, color: COLORS.text }}>
            {SLOT_LABELS[slotIndex]}
            <span style={{ marginLeft: 8, fontSize: 13, fontWeight: 400, color: COLORS.textMuted, background: COLORS.accentLight, padding: '2px 8px', borderRadius: 6 }}>
              {categoryLabel}
            </span>
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: COLORS.textMuted }}>✕</button>
        </div>

        {/* Tab switch */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <button
            onClick={() => setMode('catalog')}
            style={{
              ...btnSecondary,
              ...(mode === 'catalog' ? { background: COLORS.accent, color: '#fff' } : {})
            }}
          >
            Из каталога
          </button>
          <button
            onClick={() => setMode('manual')}
            style={{
              ...btnSecondary,
              ...(mode === 'manual' ? { background: COLORS.accent, color: '#fff' } : {})
            }}
          >
            Вручную
          </button>
        </div>

        {mode === 'catalog' ? (
          <>
            {pendingDish ? (
              /* Шаг подтверждения: выбрано блюдо, ставим цену */
              <div style={{ padding: 16, background: COLORS.accentLight, borderRadius: 10, border: `1px solid ${COLORS.accent}` }}>
                <p style={{ margin: '0 0 10px', fontWeight: 600, fontSize: 15, color: COLORS.accentDark }}>
                  ✓ {pendingDish.name}
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <label style={{ fontSize: 14, color: COLORS.text, whiteSpace: 'nowrap' }}>Цена продажи:</label>
                  <input
                    type="number"
                    value={pendingPrice}
                    onChange={e => setPendingPrice(e.target.value)}
                    placeholder="0"
                    min="0"
                    style={{ ...inputStyle, width: 90, margin: 0 }}
                    autoFocus
                    onKeyDown={e => e.key === 'Enter' && handleConfirmPending()}
                  />
                  <span style={{ fontSize: 14, color: COLORS.textMuted }}>₽</span>
                  <button onClick={handleConfirmPending} style={btnPrimary}>Добавить</button>
                  <button onClick={() => { setPendingDish(null); setPendingPrice(''); }}
                    style={{ ...btnSecondary, marginLeft: 4 }}>← Назад</button>
                </div>
                {!pendingDish.salePrice && (
                  <p style={{ margin: '8px 0 0', fontSize: 12, color: COLORS.textMuted }}>
                    💡 Цену можно задать заранее в разделе «Себестоимость»
                  </p>
                )}
              </div>
            ) : (
              <>
                <input
                  type="text"
                  placeholder={`Поиск в разделе «${categoryLabel}»...`}
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  style={searchInputStyle}
                  autoFocus
                />
                <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                  {filtered.length === 0 ? (
                    <p style={{ color: COLORS.textMuted, textAlign: 'center', padding: 20 }}>
                      {categoryFiltered.length === 0
                        ? `Нет блюд в категории «${categoryLabel}» — добавьте вручную`
                        : 'Ничего не найдено'}
                    </p>
                  ) : (
                    filtered.map(d => (
                      <div
                        key={d.id}
                        onClick={() => handleSelectFromCatalog(d)}
                        style={{
                          padding: '10px 12px',
                          borderRadius: 10,
                          cursor: 'pointer',
                          marginBottom: 4,
                          border: `1px solid ${COLORS.border}`,
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          transition: 'background 0.1s'
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = COLORS.accentLight}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <span style={{ fontWeight: 500 }}>{d.name}</span>
                        {d.salePrice
                          ? <span style={{ color: COLORS.accent, fontWeight: 600, fontSize: 13 }}>{rubFromKopeks(d.salePrice)}</span>
                          : <span style={{ color: '#bbb', fontSize: 12 }}>цена не задана</span>}
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </>
        ) : (
          <div>
            <label style={{ display: 'block', marginBottom: 12, fontSize: 14, color: COLORS.text }}>
              Название блюда
              <input
                value={manualName}
                onChange={e => setManualName(e.target.value)}
                style={inputStyle}
                placeholder="Борщ, Плов, Компот..."
                autoFocus
              />
            </label>
            <label style={{ display: 'block', marginBottom: 16, fontSize: 14, color: COLORS.text }}>
              Цена (руб.)
              <input
                value={manualPrice}
                onChange={e => setManualPrice(e.target.value)}
                style={inputStyle}
                placeholder="150"
                type="number"
                min="0"
              />
            </label>
            <button onClick={handleManualSave} style={btnPrimary}>
              Сохранить
            </button>
          </div>
        )}

        {currentName ? (
          <div style={{ marginTop: 16, paddingTop: 12, borderTop: `1px solid ${COLORS.border}` }}>
            <button onClick={onClear} style={btnDanger}>
              Очистить слот
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* ─── Main Component ─── */

export function MenuDayEditorPage() {
  const [branches, setBranches] = useState([]);
  const [branchId, setBranchId] = useState('');
  const [menuDate, setMenuDate] = useState(localTomorrowISO);
  const [serverRows, setServerRows] = useState([]);
  const [slots, setSlots] = useState(Array.from({ length: SLOT_COUNT }, () => ({ name: '', priceKopeks: 0, dishVersionId: null })));
  const [catalogDishes, setCatalogDishes] = useState([]);
  const [pickerSlot, setPickerSlot] = useState(-1);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [vkPostUrl, setVkPostUrl] = useState('');

  // --- Order Window state ---
  const [orderWindow, setOrderWindow] = useState(null); // {exists, accepting, closesAt, ...}
  const [windowBusy, setWindowBusy] = useState(false);

  // Load branches on mount
  useEffect(() => {
    fetchBranches()
      .then(b => {
        setBranches(Array.isArray(b) ? b : []);
        if (b?.[0]?.id) setBranchId(b[0].id);
      })
      .catch(e => setErr(e.message || String(e)));
  }, []);

  // Load dish catalog for picker
  useEffect(() => {
    (async () => {
      try {
        const allDishes = await fetchKitchenDishes();
        const dishes = allDishes.filter(d =>
          d.active !== false &&
          !d.name.includes('demo') && !d.name.includes('Demo') &&
          !d.name.includes('mndf9') && !d.name.includes('заглушка')
        );
        const catalog = [];
        for (const d of dishes) {
          const vers = await fetchKitchenDishVersions(d.id);
          const pub = vers.find(v => v.status === 'published');
          catalog.push({
            id: d.id,
            name: d.name,
            category: d.category || null,
            active: d.active,
            salePrice: d.salePrice || null,
            versionId: pub?.id || null,
          });
        }
        catalog.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
        setCatalogDishes(catalog);
      } catch {
        // Kitchen catalog empty or unavailable — that's OK, manual entry works
      }
    })();
  }, []);

  // Load order window status
  const loadOrderWindow = useCallback(() => {
    if (!branchId || !menuDate) return;
    fetchOrderWindow(branchId, menuDate)
      .then(data => setOrderWindow(data))
      .catch(() => setOrderWindow(null));
  }, [branchId, menuDate]);

  useEffect(() => {
    if (branchId && menuDate) loadOrderWindow();
  }, [branchId, menuDate, loadOrderWindow]);

  async function handleToggleOrderWindow() {
    if (!branchId || !menuDate) return;
    setWindowBusy(true);
    setErr('');
    try {
      if (orderWindow?.accepting) {
        await closeOrderWindow(branchId, menuDate);
      } else {
        await openOrderWindow(branchId, menuDate);
      }
      loadOrderWindow();
    } catch (e) {
      setErr(e.message || String(e));
    } finally {
      setWindowBusy(false);
    }
  }

  // Load menu when branch or date changes
  const loadMenu = useCallback(() => {
    if (!branchId || !menuDate) return;
    setLoading(true);
    setErr('');
    setMsg('');
    fetchMenuDayItems(branchId, menuDate)
      .then(data => {
        const rows = Array.isArray(data) ? data : [];
        setServerRows(rows);
        // Map server rows to slots by position (1-based → 0-based)
        const newSlots = Array.from({ length: SLOT_COUNT }, (_, i) => {
          const row = rows.find(r => r.position === i + 1);
          if (row) {
            return { name: row.name, priceKopeks: row.price || 0, dishVersionId: row.dishVersionId || null };
          }
          return { name: '', priceKopeks: 0, dishVersionId: null };
        });
        setSlots(newSlots);
      })
      .catch(e => {
        setErr(e.message || String(e));
        setSlots(Array.from({ length: SLOT_COUNT }, () => ({ name: '', priceKopeks: 0, dishVersionId: null })));
      })
      .finally(() => setLoading(false));
  }, [branchId, menuDate]);

  useEffect(() => {
    if (branchId) loadMenu();
  }, [branchId, menuDate, loadMenu]);

  // Save all slots at once
  async function saveAll() {
    if (!branchId || !menuDate) return;
    setSaving(true);
    setErr('');
    setMsg('');
    try {
      for (let i = 0; i < SLOT_COUNT; i++) {
        const s = slots[i];
        if (s.name.trim()) {
          const body = {
            branchId,
            date: menuDate,
            position: i + 1,
            name: s.name.trim(),
            price: s.priceKopeks
          };
          if (s.dishVersionId) body.dishVersionId = s.dishVersionId;
          await upsertMenuDayItem(body);
        }
      }
      setMsg('Меню сохранено!');
      loadMenu();
    } catch (e) {
      setErr(e.message || String(e));
    } finally {
      setSaving(false);
    }
  }

  // Slot picker handlers
  function handleSlotClick(index) {
    setPickerSlot(index);
  }

  function handlePickerSave({ name, priceKopeks, dishVersionId }) {
    setSlots(prev => {
      const next = [...prev];
      next[pickerSlot] = { name, priceKopeks, dishVersionId };
      return next;
    });
    setPickerSlot(-1);
  }

  function handlePickerClear() {
    setSlots(prev => {
      const next = [...prev];
      next[pickerSlot] = { name: '', priceKopeks: 0, dishVersionId: null };
      return next;
    });
    setPickerSlot(-1);
  }

  const filledCount = slots.filter(s => s.name.trim()).length;
  const totalPrice = slots.reduce((sum, s) => sum + (s.name.trim() ? s.priceKopeks : 0), 0);
  const hasChanges = true; // simplified — always allow save

  return (
    <div style={pageStyle}>
      {/* Header */}
      <div style={headerStyle}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, color: COLORS.text }}>Меню на день</h1>
          <p style={{ margin: '4px 0 0', color: COLORS.textMuted, fontSize: 14 }}>
            Нажмите на слот, чтобы выбрать блюдо
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {branches.length > 1 ? (
            <select
              value={branchId}
              onChange={e => setBranchId(e.target.value)}
              style={{ padding: '8px 12px', borderRadius: 8, border: `1px solid ${COLORS.border}`, fontSize: 14 }}
            >
              {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          ) : null}
          <input
            type="date"
            value={menuDate}
            onChange={e => setMenuDate(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: 8, border: `1px solid ${COLORS.border}`, fontSize: 14 }}
          />
        </div>
      </div>

      {/* Messages */}
      {err ? (
        <div style={{ color: COLORS.danger, padding: '10px 14px', background: '#fff5f5', borderRadius: 10, marginBottom: 14, fontSize: 14 }} role="alert">
          {err}
        </div>
      ) : null}
      {msg ? (
        <div style={{ color: COLORS.success, padding: '10px 14px', background: '#e8f5e9', borderRadius: 10, marginBottom: 14, fontSize: 14 }} role="status">
          {msg}
        </div>
      ) : null}

      {loading ? (
        <p style={{ textAlign: 'center', color: COLORS.textMuted, padding: 40 }}>Загрузка...</p>
      ) : (
        <>
          {/* Slot Grid */}
          <div style={gridStyle}>
            {slots.map((s, i) => {
              const filled = Boolean(s.name.trim());
              return (
                <div
                  key={i}
                  onClick={() => handleSlotClick(i)}
                  style={slotCardStyle(filled)}
                  onMouseEnter={e => {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.08)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.transform = 'none';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSlotClick(i); } }}
                >
                  <div style={slotLabelStyle}>{SLOT_LABELS[i]}</div>
                  {filled ? (
                    <>
                      <div style={slotNameStyle}>{s.name}</div>
                      <div style={slotPriceStyle}>{rubFromKopeks(s.priceKopeks)}</div>
                    </>
                  ) : (
                    <div style={emptySlotStyle}>+</div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Order Window Status */}
          <div style={{
            marginTop: 20,
            padding: '12px 18px',
            background: orderWindow?.accepting ? '#e8f5e9' : '#fff3e0',
            borderRadius: 14,
            border: `2px solid ${orderWindow?.accepting ? COLORS.success : COLORS.warning}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 10
          }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: orderWindow?.accepting ? COLORS.success : COLORS.warning }}>
              {orderWindow?.accepting
                ? `Приём заказов открыт (до ${orderWindow.closesAt ? new Date(orderWindow.closesAt).toLocaleString('ru-RU', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' }) : '06:00'})`
                : 'Приём заказов закрыт'}
            </div>
            <button
              onClick={handleToggleOrderWindow}
              disabled={windowBusy || filledCount === 0}
              style={{
                background: orderWindow?.accepting ? COLORS.warning : COLORS.success,
                color: '#fff',
                border: 'none',
                borderRadius: 10,
                padding: '10px 20px',
                fontSize: 15,
                fontWeight: 600,
                cursor: windowBusy || filledCount === 0 ? 'default' : 'pointer',
                opacity: windowBusy || filledCount === 0 ? 0.5 : 1
              }}
            >
              {windowBusy
                ? '...'
                : orderWindow?.accepting
                  ? 'Закрыть приём'
                  : 'Открыть приём заказов'}
            </button>
          </div>

          {/* Summary & Save */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: 14,
            padding: '14px 18px',
            background: COLORS.card,
            borderRadius: 14,
            border: `1px solid ${COLORS.border}`,
            flexWrap: 'wrap',
            gap: 12
          }}>
            <div style={{ fontSize: 14, color: COLORS.text }}>
              Заполнено: <strong>{filledCount}</strong> из {SLOT_COUNT}
              {totalPrice > 0 ? (
                <span style={{ marginLeft: 16 }}>
                  Сумма меню: <strong style={{ color: COLORS.accent }}>{rubFromKopeks(totalPrice)}</strong>
                </span>
              ) : null}
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button
                onClick={saveAll}
                disabled={saving || filledCount === 0}
                style={{ ...btnPrimary, opacity: saving || filledCount === 0 ? 0.5 : 1 }}
              >
                {saving ? 'Сохранение...' : 'Сохранить меню'}
              </button>
              <button
                onClick={async () => {
                  setPublishing(true);
                  setErr('');
                  setVkPostUrl('');
                  try {
                    const r = await publishMenuToVk(branchId, menuDate);
                    setVkPostUrl(r.postUrl);
                    setMsg('Меню опубликовано в VK!');
                  } catch (e) {
                    setErr('VK: ' + (e.message || String(e)));
                  } finally {
                    setPublishing(false);
                  }
                }}
                disabled={publishing || filledCount === 0 || !branchId}
                style={{
                  background: publishing || filledCount === 0 ? '#999' : '#4c75a3',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 10,
                  padding: '10px 20px',
                  fontSize: 15,
                  fontWeight: 600,
                  cursor: publishing || filledCount === 0 ? 'default' : 'pointer',
                  opacity: publishing || filledCount === 0 ? 0.6 : 1
                }}
              >
                {publishing ? 'Публикация...' : 'Опубликовать в VK'}
              </button>
            </div>
            {vkPostUrl && (
              <a href={vkPostUrl} target="_blank" rel="noopener noreferrer"
                style={{ fontSize: 13, color: '#4c75a3', textDecoration: 'none' }}>
                Пост опубликован, посмотреть
              </a>
            )}
          </div>
        </>
      )}

      {/* Dish Picker Modal */}
      <DishPickerModal
        open={pickerSlot >= 0}
        slotIndex={pickerSlot >= 0 ? pickerSlot : 0}
        currentName={pickerSlot >= 0 ? slots[pickerSlot]?.name : ''}
        currentPrice={pickerSlot >= 0 ? slots[pickerSlot]?.priceKopeks : 0}
        catalogDishes={catalogDishes}
        onSave={handlePickerSave}
        onClear={handlePickerClear}
        onClose={() => setPickerSlot(-1)}
      />
    </div>
  );
}
