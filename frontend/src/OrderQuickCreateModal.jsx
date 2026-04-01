import { useEffect, useMemo, useState } from 'react';
import { fetchMenuDayItems, postManualDeliveryOrder } from './api.js';
import { orderSourceChannelButtonLabel, ORDER_SOURCE_CHANNEL_OPTIONS } from './i18n/ru.js';
import { formatDateDots, formatDateRuLong, localTomorrowISO } from './dates.js';
import { BranchNameHint } from './BranchNameHint.jsx';
import { RuDateField } from './RuDateField.jsx';
import { parseCompactOrderItems } from './operatorCompactItems.js';

const overlayStyle = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.45)',
  zIndex: 1000,
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'center',
  padding: '16px 12px',
  overflowY: 'auto',
  WebkitOverflowScrolling: 'touch'
};

const panelStyle = {
  background: '#fff',
  borderRadius: 16,
  maxWidth: 560,
  width: '100%',
  marginTop: 24,
  marginBottom: 24,
  padding: 24,
  boxShadow: '0 8px 32px rgba(0,0,0,0.12)'
};

const cardStyle = {
  background: '#f5f7fa',
  borderRadius: 12,
  padding: 16,
  marginBottom: 16,
  border: '1px solid #e8eaed'
};

const labelBlock = { display: 'block', marginBottom: 14 };
const inputFull = {
  width: '100%',
  maxWidth: '100%',
  padding: '12px 14px',
  marginTop: 6,
  boxSizing: 'border-box',
  fontSize: 16,
  borderRadius: 10,
  border: '2px solid #e0e0e0'
};

const btnBase = {
  minHeight: 48,
  padding: '12px 16px',
  fontSize: 16,
  fontWeight: 600,
  borderRadius: 10,
  cursor: 'pointer',
  border: '2px solid #bdbdbd',
  background: '#fff',
  color: '#1a1a1a'
};

const dayPresetBase = {
  flex: '1 1 0',
  minWidth: 0,
  minHeight: 56,
  padding: '10px 12px',
  fontSize: 15,
  fontWeight: 700,
  borderRadius: 10,
  cursor: 'pointer',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 4,
  lineHeight: 1.2,
  border: '1px solid #bbb',
  background: '#fff'
};
const dayPresetActive = {
  ...dayPresetBase,
  background: '#1565c0',
  color: '#fff',
  borderColor: '#1565c0'
};

/**
 * @param {{
 *   open: boolean,
 *   onClose: () => void,
 *   branches: Array<{ id: string, name: string }>,
 *   defaultBranchId: string,
 *   prefill: null | {
 *     vkLeadId?: string,
 *     customerName?: string,
 *     customerPhone?: string,
 *     address?: string,
 *     comment?: string,
 *     deliveryDateIso?: string | null,
 *     requestedDateUnresolved?: string,
 *     sourceChannel?: string,
 *     companyAccountId?: string,
 *     defaultBranchId?: string | null
 *   },
 *   onSuccess: (order: object) => void,
 *   yesterdayIso: string,
 *   todayIso: string,
 *   tomorrowIso: string
 * }} props
 */
export function OrderQuickCreateModal({
  open,
  onClose,
  branches,
  defaultBranchId,
  prefill,
  onSuccess,
  yesterdayIso,
  todayIso,
  tomorrowIso,
  onBranchesReload
}) {
  const [branchId, setBranchId] = useState('');
  const [deliveryDate, setDeliveryDate] = useState(localTomorrowISO());
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [address, setAddress] = useState('');
  const [comment, setComment] = useState('');
  const [sourceChannel, setSourceChannel] = useState('MANUAL');
  const [qtyByPos, setQtyByPos] = useState(() => Object.fromEntries([...Array(10)].map((_, i) => [i + 1, 0])));
  const [menuRows, setMenuRows] = useState([]);
  const [menuErr, setMenuErr] = useState('');
  const [submitErr, setSubmitErr] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState(null);
  const [compactLine, setCompactLine] = useState('');
  const [compactErr, setCompactErr] = useState('');
  const [showManualQty, setShowManualQty] = useState(false);
  const [showOtherDate, setShowOtherDate] = useState(false);

  const vkLeadId = prefill?.vkLeadId || null;
  const companyAccountId = prefill?.companyAccountId || null;
  const unresolvedDate = prefill?.requestedDateUnresolved || '';

  useEffect(() => {
    if (!open) return;
    setCreated(null);
    setSubmitErr('');
    setMenuErr('');
    const hint = prefill?.defaultBranchId;
    const fromHint = hint && branches.some((x) => x.id === hint) ? hint : null;
    const b = fromHint || defaultBranchId || branches[0]?.id || '';
    setBranchId(b);
    const parsedIso = prefill?.deliveryDateIso;
    const initial =
      parsedIso && /^\d{4}-\d{2}-\d{2}$/.test(parsedIso) ? parsedIso : localTomorrowISO();
    setDeliveryDate(initial);
    const presets = [yesterdayIso, todayIso, tomorrowIso];
    setShowOtherDate(!presets.includes(initial));
    setCustomerName(prefill?.customerName || '');
    setCustomerPhone(prefill?.customerPhone || '');
    setAddress(prefill?.address || '');
    setComment(prefill?.comment || '');
    setSourceChannel(vkLeadId ? 'VK' : prefill?.sourceChannel || 'MANUAL');
    setQtyByPos(Object.fromEntries([...Array(10)].map((_, i) => [i + 1, 0])));
    setCompactLine('');
    setCompactErr('');
    setShowManualQty(false);
  }, [open, prefill, defaultBranchId, branches, yesterdayIso, todayIso, tomorrowIso]);

  useEffect(() => {
    if (!open || !branchId || !deliveryDate) {
      setMenuRows([]);
      return;
    }
    let cancelled = false;
    setMenuErr('');
    fetchMenuDayItems(branchId, deliveryDate)
      .then((rows) => {
        if (!cancelled) setMenuRows(Array.isArray(rows) ? rows : []);
      })
      .catch((e) => {
        if (!cancelled) {
          setMenuRows([]);
          setMenuErr(e.message || String(e));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, branchId, deliveryDate]);

  const itemsPayload = useMemo(() => {
    const out = [];
    for (let p = 1; p <= 10; p++) {
      const q = Number(qtyByPos[p]) || 0;
      if (q > 0) out.push({ position: p, qty: q });
    }
    return out;
  }, [qtyByPos]);

  if (!open) return null;

  async function submit(e) {
    e.preventDefault();
    setSubmitErr('');
    setSubmitting(true);
    try {
      const body = {
        branchId,
        deliveryDate,
        customerName: customerName.trim(),
        customerPhone,
        address: address.trim() || null,
        comment: comment.trim() || null,
        items: itemsPayload,
        sourceChannel: vkLeadId ? 'VK' : sourceChannel,
        vkLeadId: vkLeadId || undefined,
        companyAccountId: companyAccountId || undefined
      };
      const order = await postManualDeliveryOrder(body);
      setCreated(order);
      onSuccess(order);
    } catch (err) {
      setSubmitErr(err.message || String(err));
    } finally {
      setSubmitting(false);
    }
  }

  function slotLabel(pos) {
    const row = menuRows.find((r) => r.position === pos);
    const n = row?.name ? String(row.name).trim() : '';
    return n ? `${pos}. ${n}` : `Позиция ${pos}`;
  }

  function applyCompactLine() {
    setCompactErr('');
    const parsed = parseCompactOrderItems(compactLine);
    if (!parsed.ok) {
      setCompactErr(parsed.error);
      return;
    }
    const next = Object.fromEntries([...Array(10)].map((_, i) => [i + 1, 0]));
    for (const { position, qty } of parsed.items) {
      next[position] = qty;
    }
    setQtyByPos(next);
    setCompactErr('');
  }

  return (
    <div style={overlayStyle} role="presentation" onClick={onClose}>
      <div
        style={panelStyle}
        role="dialog"
        aria-labelledby="order-quick-title"
        onClick={(ev) => ev.stopPropagation()}
      >
        <h2 id="order-quick-title" style={{ marginTop: 0, marginBottom: 4, fontSize: '1.35rem' }}>
          Быстрый заказ
        </h2>
        {vkLeadId ? (
          <p style={{ fontSize: 13, color: '#555', marginTop: 0 }}>
            Из лида VK · канал заказа <strong>VK</strong> · после сохранения лид будет связан с заказом.
          </p>
        ) : companyAccountId ? (
          <p style={{ fontSize: 13, color: '#555', marginTop: 0 }}>
            Повторный заказ для B2B: заказ будет привязан к карточке компании. Состав и сумму укажите по факту
            переговоров.
          </p>
        ) : (
          <p style={{ fontSize: 13, color: '#555', marginTop: 0 }}>
            Создание реального заказа в системе (как на сайте): сумма считается по меню на выбранную дату.
          </p>
        )}

        {unresolvedDate ? (
          <div
            style={{
              padding: 12,
              background: '#fff8e1',
              borderRadius: 8,
              marginBottom: 14,
              fontSize: 13
            }}
          >
            <strong>Дата из заявки VK не распознана автоматически.</strong>
            <div style={{ marginTop: 6 }}>Текст клиента: «{unresolvedDate}»</div>
            <div style={{ marginTop: 6 }}>Выберите корректную дату доставки ниже.</div>
          </div>
        ) : null}

        {created ? (
          <div style={{ padding: 12, background: '#e8f5e9', borderRadius: 8, marginBottom: 16 }}>
            <strong>Заказ создан</strong>
            <p style={{ margin: '8px 0 0', fontSize: 14 }}>
              ID: <code>{created.id}</code>
            </p>
            {created.itemsSubtotalKopeks != null && created.deliveryFeeKopeks != null ? (
              <>
                <p style={{ margin: '4px 0 0', fontSize: 14 }}>
                  Позиции: {(Number(created.itemsSubtotalKopeks) / 100).toLocaleString('ru-RU')} ₽
                </p>
                <p style={{ margin: '4px 0 0', fontSize: 14 }}>
                  Доставка:{' '}
                  {created.deliveryFeeKopeks > 0
                    ? `${(Number(created.deliveryFeeKopeks) / 100).toLocaleString('ru-RU')} ₽`
                    : 'бесплатно'}
                </p>
              </>
            ) : null}
            <p style={{ margin: '4px 0 0', fontSize: 14 }}>
              Итого: {(Number(created.totalAmount) / 100).toLocaleString('ru-RU')} ₽
            </p>
            <p style={{ margin: '6px 0 0', fontSize: 12, color: '#666' }}>
              Бесплатная доставка от 400 ₽; ниже 400 ₽ — доставка 50 ₽.
            </p>
            <button type="button" style={{ marginTop: 12, padding: '10px 16px', cursor: 'pointer' }} onClick={onClose}>
              Закрыть
            </button>
          </div>
        ) : (
          <form onSubmit={submit}>
            <div style={cardStyle}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#666', marginBottom: 12, letterSpacing: '0.04em' }}>
                КУДА И КОГДА
              </div>
              <label style={{ ...labelBlock, marginBottom: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>Точка</span>
                <select
                  value={branchId}
                  onChange={(e) => setBranchId(e.target.value)}
                  required
                  style={{ ...inputFull, display: 'block' }}
                >
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </label>
              <BranchNameHint branches={branches} onBranchesReload={onBranchesReload} />
              <div style={{ marginTop: 12 }}>
                <span style={{ fontSize: 14, fontWeight: 600, display: 'block', marginBottom: 8 }}>
                  День доставки
                </span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 8 }}>
                  {[
                    { iso: yesterdayIso, title: 'Вчера' },
                    { iso: todayIso, title: 'Сегодня' },
                    { iso: tomorrowIso, title: 'Завтра' }
                  ].map(({ iso, title }) => {
                    const on = deliveryDate === iso && !showOtherDate;
                    return (
                      <button
                        key={iso}
                        type="button"
                        onClick={() => {
                          setDeliveryDate(iso);
                          setShowOtherDate(false);
                        }}
                        style={on ? dayPresetActive : dayPresetBase}
                      >
                        <span>{title}</span>
                        <span
                          style={{
                            fontSize: 14,
                            fontWeight: 600,
                            opacity: 0.95,
                            color: on ? '#fff' : '#1565c0'
                          }}
                        >
                          {formatDateDots(iso)}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {!showOtherDate && formatDateRuLong(deliveryDate) ? (
                  <p style={{ margin: '0 0 10px', fontSize: 16, fontWeight: 600, color: '#333' }}>
                    {formatDateRuLong(deliveryDate)}
                  </p>
                ) : null}
                {!showOtherDate ? (
                  <button
                    type="button"
                    onClick={() => setShowOtherDate(true)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#1565c0',
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: 'pointer',
                      textDecoration: 'underline',
                      padding: 0
                    }}
                  >
                    Другая дата…
                  </button>
                ) : (
                  <div style={{ marginTop: 8 }}>
                    <RuDateField
                      label="Укажите дату (дд.мм.гггг)"
                      value={deliveryDate}
                      onChange={setDeliveryDate}
                      variant="compact"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setShowOtherDate(false);
                        setDeliveryDate(tomorrowIso);
                      }}
                      style={{
                        marginTop: 10,
                        ...btnBase,
                        background: '#f5f5f5',
                        fontSize: 14
                      }}
                    >
                      Назад к вчера / сегодня / завтра
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div style={cardStyle}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#666', marginBottom: 12, letterSpacing: '0.04em' }}>
                КЛИЕНТ
              </div>
              <label style={labelBlock}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>Имя</span>
                <input
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  required
                  style={{ ...inputFull, display: 'block' }}
                />
              </label>
              <label style={labelBlock}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>Телефон</span>
                <input
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  required
                  inputMode="tel"
                  style={{ ...inputFull, display: 'block' }}
                />
              </label>
              <label style={labelBlock}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>Адрес</span>
                <input value={address} onChange={(e) => setAddress(e.target.value)} style={{ ...inputFull, display: 'block' }} />
              </label>
              <label style={{ ...labelBlock, marginBottom: 0 }}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>Комментарий</span>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  rows={2}
                  style={{ ...inputFull, display: 'block', resize: 'vertical' }}
                />
              </label>
            </div>

            {!vkLeadId ? (
              <div style={{ ...cardStyle, marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#666', marginBottom: 8, letterSpacing: '0.04em' }}>
                  ОТКУДА ЗАКАЗ
                </div>
                <p style={{ fontSize: 13, color: '#555', margin: '0 0 12px' }}>Один вариант — нажмите кнопку.</p>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, 1fr)',
                    gap: 10
                  }}
                >
                  {ORDER_SOURCE_CHANNEL_OPTIONS.map((c) => {
                    const active = sourceChannel === c;
                    return (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setSourceChannel(c)}
                        style={{
                          ...btnBase,
                          minHeight: 52,
                          border: active ? '2px solid #1565c0' : '2px solid #e0e0e0',
                          background: active ? '#e3f2fd' : '#fff',
                          fontWeight: active ? 700 : 600
                        }}
                      >
                        {orderSourceChannelButtonLabel(c)}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            <fieldset
              style={{
                border: 'none',
                margin: '0 0 16px',
                padding: 16,
                borderRadius: 12,
                background: '#e3f2fd',
                boxSizing: 'border-box'
              }}
            >
              <legend style={{ fontSize: 15, fontWeight: 700, padding: '0 8px' }}>Что в заказе</legend>
              {menuErr ? <p style={{ color: '#c62828', fontSize: 14, marginTop: 0 }}>{menuErr}</p> : null}

              <p style={{ fontSize: 14, color: '#37474f', margin: '0 0 10px', lineHeight: 1.4 }}>
                Удобнее всего ввести строкой: номер позиции и количество (например <strong>1×1 3×2</strong> — одна единица
                из слота 1, две из слота 3).
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
                <input
                  value={compactLine}
                  onChange={(e) => setCompactLine(e.target.value)}
                  placeholder="Например: 1x1 3x1 5x1"
                  style={{
                    ...inputFull,
                    flex: '1 1 220px',
                    marginTop: 0,
                    minHeight: 52,
                    fontSize: 18,
                    background: '#fff',
                    border: '2px solid #90caf9'
                  }}
                />
                <button
                  type="button"
                  onClick={applyCompactLine}
                  style={{ ...btnBase, minHeight: 52, fontWeight: 700, background: '#fff', borderColor: '#1565c0' }}
                >
                  Применить
                </button>
              </div>
              {compactErr ? (
                <p style={{ color: '#c62828', fontSize: 14, margin: '0 0 10px' }} role="alert">
                  {compactErr}
                </p>
              ) : null}

              <button
                type="button"
                onClick={() => setShowManualQty((v) => !v)}
                style={{
                  ...btnBase,
                  width: '100%',
                  marginBottom: showManualQty ? 14 : 8,
                  background: '#fff',
                  fontSize: 15
                }}
              >
                {showManualQty ? '▼ Свернуть таблицу по слотам' : '▶ Открыть таблицу по слотам (1–10)'}
              </button>

              {showManualQty ? (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                    gap: 10
                  }}
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((pos) => (
                    <div
                      key={pos}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 8,
                        padding: '10px 12px',
                        background: '#fff',
                        borderRadius: 10,
                        border: '1px solid #bbdefb',
                        minHeight: 52
                      }}
                    >
                      <span
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          flex: 1,
                          minWidth: 0,
                          lineHeight: 1.25,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}
                        title={slotLabel(pos)}
                      >
                        {slotLabel(pos)}
                      </span>
                      <input
                        type="number"
                        min={0}
                        max={99}
                        value={qtyByPos[pos]}
                        onChange={(e) =>
                          setQtyByPos((prev) => ({
                            ...prev,
                            [pos]: Math.max(0, Math.min(99, Number(e.target.value) || 0))
                          }))
                        }
                        style={{
                          width: 56,
                          padding: 8,
                          minHeight: 44,
                          fontSize: 18,
                          textAlign: 'center',
                          borderRadius: 8,
                          border: '2px solid #e0e0e0',
                          fontVariantNumeric: 'tabular-nums'
                        }}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ fontSize: 15, fontWeight: 600, color: '#1565c0', margin: 0 }}>
                  {itemsPayload.length
                    ? itemsPayload.map((i) => `${i.position}×${i.qty}`).join(' · ')
                    : 'Пока пусто — введите строку выше и нажмите «Применить»'}
                </p>
              )}
            </fieldset>

            {submitErr ? (
              <p style={{ color: '#c62828', fontSize: 14 }} role="alert">
                {submitErr}
              </p>
            ) : null}

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 12 }}>
              <button
                type="submit"
                disabled={submitting || itemsPayload.length === 0}
                style={{
                  minHeight: 52,
                  minWidth: 160,
                  padding: '14px 24px',
                  fontSize: 17,
                  fontWeight: 700,
                  cursor: itemsPayload.length ? 'pointer' : 'not-allowed',
                  background: '#2e7d32',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 10,
                  boxShadow: itemsPayload.length ? '0 2px 6px rgba(46,125,50,0.35)' : 'none'
                }}
              >
                {submitting ? 'Создание…' : 'Создать заказ'}
              </button>
              <button
                type="button"
                onClick={onClose}
                style={{
                  minHeight: 52,
                  padding: '14px 22px',
                  fontSize: 16,
                  borderRadius: 10,
                  cursor: 'pointer',
                  ...btnBase,
                  background: '#fff'
                }}
              >
                Отмена
              </button>
            </div>
            {itemsPayload.length === 0 ? (
              <p style={{ fontSize: 12, color: '#888', marginTop: 8 }}>Выберите хотя бы одну позицию с количеством &gt; 0.</p>
            ) : null}
          </form>
        )}

        <p style={{ fontSize: 12, color: '#888', marginBottom: 0, marginTop: 16 }}>
          После сохранения список заказов обновится. Если ошибка — проверьте меню на эту дату и точку.
        </p>
      </div>
    </div>
  );
}
