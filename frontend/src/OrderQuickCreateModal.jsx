import { useEffect, useMemo, useState } from 'react';
import { fetchMenuDayItems, postManualDeliveryOrder } from './api.js';
import {
  orderSourceChannelLabel,
  ORDER_SOURCE_CHANNEL_OPTIONS,
  nav
} from './i18n/ru.js';
import { localTomorrowISO } from './dates.js';
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
  borderRadius: 12,
  maxWidth: 520,
  width: '100%',
  marginTop: 24,
  marginBottom: 24,
  padding: 20,
  boxShadow: '0 8px 32px rgba(0,0,0,0.12)'
};

const labelBlock = { display: 'block', marginBottom: 14 };
const inputFull = { width: '100%', maxWidth: '100%', padding: 10, marginTop: 4, boxSizing: 'border-box' };

const OP_SOURCE_QUICK = ['MANUAL', 'PHONE', 'VK'];

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
 *   onSuccess: (order: object) => void
 * }} props
 */
export function OrderQuickCreateModal({ open, onClose, branches, defaultBranchId, prefill, onSuccess }) {
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
    setDeliveryDate(parsedIso && /^\d{4}-\d{2}-\d{2}$/.test(parsedIso) ? parsedIso : localTomorrowISO());
    setCustomerName(prefill?.customerName || '');
    setCustomerPhone(prefill?.customerPhone || '');
    setAddress(prefill?.address || '');
    setComment(prefill?.comment || '');
    setSourceChannel(vkLeadId ? 'VK' : prefill?.sourceChannel || 'MANUAL');
    setQtyByPos(Object.fromEntries([...Array(10)].map((_, i) => [i + 1, 0])));
    setCompactLine('');
    setCompactErr('');
    setShowManualQty(false);
  }, [open, prefill, defaultBranchId, branches]);

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
        <h2 id="order-quick-title" style={{ marginTop: 0, fontSize: '1.2rem' }}>
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
            <p style={{ margin: '4px 0 0', fontSize: 14 }}>
              Сумма: {(Number(created.totalAmount) / 100).toLocaleString('ru-RU')} ₽
            </p>
            <button type="button" style={{ marginTop: 12, padding: '10px 16px', cursor: 'pointer' }} onClick={onClose}>
              Закрыть
            </button>
          </div>
        ) : (
          <form onSubmit={submit}>
            <label style={labelBlock}>
              Точка
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
            <label style={labelBlock}>
              Дата доставки
              <input
                type="date"
                required
                value={deliveryDate}
                onChange={(e) => setDeliveryDate(e.target.value)}
                style={{ ...inputFull, display: 'block' }}
              />
            </label>
            <label style={labelBlock}>
              Имя клиента
              <input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                required
                style={{ ...inputFull, display: 'block' }}
              />
            </label>
            <label style={labelBlock}>
              Телефон
              <input
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                required
                inputMode="tel"
                style={{ ...inputFull, display: 'block' }}
              />
            </label>
            <label style={labelBlock}>
              Адрес
              <input value={address} onChange={(e) => setAddress(e.target.value)} style={{ ...inputFull, display: 'block' }} />
            </label>
            <label style={labelBlock}>
              Комментарий
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={2}
                style={{ ...inputFull, display: 'block', resize: 'vertical' }}
              />
            </label>
            {!vkLeadId ? (
              <div style={{ marginBottom: 16 }}>
                <span style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 8 }}>Канал</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {OP_SOURCE_QUICK.map((c) => {
                    const active = sourceChannel === c;
                    return (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setSourceChannel(c)}
                        style={{
                          minHeight: 48,
                          padding: '12px 14px',
                          fontSize: 15,
                          fontWeight: 700,
                          borderRadius: 10,
                          border: active ? '2px solid #1565c0' : '1px solid #ccc',
                          background: active ? '#e3f2fd' : '#fff',
                          cursor: 'pointer'
                        }}
                      >
                        {orderSourceChannelLabel(c)}
                      </button>
                    );
                  })}
                </div>
                <label style={{ ...labelBlock, marginTop: 10, marginBottom: 0 }}>
                  <span style={{ fontSize: 12, color: '#666' }}>Другой канал</span>
                  <select
                    value={ORDER_SOURCE_CHANNEL_OPTIONS.includes(sourceChannel) ? sourceChannel : 'MANUAL'}
                    onChange={(e) => setSourceChannel(e.target.value)}
                    style={{ ...inputFull, display: 'block', minHeight: 44 }}
                  >
                    {ORDER_SOURCE_CHANNEL_OPTIONS.filter((x) => x !== 'SITE').map((c) => (
                      <option key={c} value={c}>
                        {orderSourceChannelLabel(c)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ) : null}

            <fieldset style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12, margin: '16px 0' }}>
              <legend style={{ fontSize: 14, fontWeight: 600 }}>Позиции</legend>
              {menuErr ? <p style={{ color: '#c62828', fontSize: 13 }}>{menuErr}</p> : null}

              <label style={{ display: 'block', marginBottom: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>Быстрый ввод</span>
                <span style={{ fontSize: 12, color: '#666', display: 'block', marginTop: 2 }}>
                  Напр. <code>1x1 2x1 3x1</code> или <code>7x2</code> (позиция 1–10, × * : /)
                </span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
                  <input
                    value={compactLine}
                    onChange={(e) => setCompactLine(e.target.value)}
                    placeholder="1x1 3x1 5x1"
                    style={{ ...inputFull, flex: '1 1 200px', minHeight: 48, fontSize: 17 }}
                  />
                  <button type="button" onClick={applyCompactLine} style={{ minHeight: 48, padding: '0 16px', fontWeight: 600 }}>
                    Применить
                  </button>
                </div>
                {compactErr ? (
                  <p style={{ color: '#c62828', fontSize: 13, margin: '6px 0 0' }} role="alert">
                    {compactErr}
                  </p>
                ) : null}
              </label>

              <button
                type="button"
                onClick={() => setShowManualQty((v) => !v)}
                style={{ marginBottom: 10, padding: '8px 12px', fontSize: 13 }}
              >
                {showManualQty ? '▼ Скрыть поля по позициям' : '▶ Поля по позициям (вручную)'}
              </button>

              {showManualQty ? (
                <div style={{ display: 'grid', gap: 8 }}>
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((pos) => (
                    <label key={pos} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 14 }}>
                      <span style={{ flex: '1 1 200px' }}>{slotLabel(pos)}</span>
                      <input
                        type="number"
                        min={0}
                        max={99}
                        value={qtyByPos[pos]}
                        onChange={(e) =>
                          setQtyByPos((prev) => ({ ...prev, [pos]: Math.max(0, Math.min(99, Number(e.target.value) || 0)) }))
                        }
                        style={{ width: 72, padding: 10, minHeight: 44, fontSize: 16 }}
                      />
                    </label>
                  ))}
                </div>
              ) : (
                <p style={{ fontSize: 13, color: '#555', margin: 0 }}>
                  Сейчас:{' '}
                  {itemsPayload.length
                    ? itemsPayload.map((i) => `${i.position}×${i.qty}`).join(', ')
                    : 'позиции не выбраны'}
                </p>
              )}
            </fieldset>

            {submitErr ? (
              <p style={{ color: '#c62828', fontSize: 14 }} role="alert">
                {submitErr}
              </p>
            ) : null}

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 8 }}>
              <button
                type="submit"
                disabled={submitting || itemsPayload.length === 0}
                style={{
                  minHeight: 52,
                  padding: '14px 22px',
                  fontSize: 17,
                  fontWeight: 700,
                  cursor: itemsPayload.length ? 'pointer' : 'not-allowed',
                  background: '#2e7d32',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 10
                }}
              >
                {submitting ? 'Создание…' : 'Создать заказ'}
              </button>
              <button
                type="button"
                onClick={onClose}
                style={{ minHeight: 52, padding: '14px 20px', fontSize: 16, borderRadius: 10, cursor: 'pointer' }}
              >
                Отмена
              </button>
            </div>
            {itemsPayload.length === 0 ? (
              <p style={{ fontSize: 12, color: '#888', marginTop: 8 }}>Выберите хотя бы одну позицию с количеством &gt; 0.</p>
            ) : null}
          </form>
        )}

        <p style={{ fontSize: 11, color: '#999', marginBottom: 0, marginTop: 16 }}>
          Раздел «{nav.ordersKpi}» обновится после создания. При ошибке проверьте меню на дату и филиал.
        </p>
      </div>
    </div>
  );
}
