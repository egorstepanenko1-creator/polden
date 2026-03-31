import { useCallback, useEffect, useState } from 'react';
import {
  fetchBranches,
  fetchPurchaseDraft,
  fetchPurchaseDrafts,
  fetchPurchaseNeedSnapshot,
  generatePurchaseDraft,
  patchPurchaseDraftNote,
  postPurchaseDraftReceive
} from './api.js';
import { localTomorrowISO } from './dates.js';

function cardStyle() {
  return {
    border: '1px solid #e0e0e0',
    borderRadius: 10,
    padding: '14px 16px',
    background: '#fafafa',
    marginBottom: 16
  };
}

function fmtQty(n) {
  if (n == null || Number.isNaN(n)) return '—';
  return Number(n).toLocaleString('ru-RU', { maximumFractionDigits: 6 });
}

function rubKopeks(k) {
  return `${(Number(k || 0) / 100).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₽`;
}

const receiptStatusRu = {
  NONE: 'Приёмка: не начата',
  RECEIVED_PARTIAL: 'Приёмка: частично',
  RECEIVED_FULL: 'Приёмка: полностью по потребности'
};

export function PurchaseDraftsPage() {
  const [branches, setBranches] = useState([]);
  const [branchId, setBranchId] = useState('');
  const [dayDate, setDayDate] = useState(localTomorrowISO);
  const [snapshot, setSnapshot] = useState(null);
  const [draftList, setDraftList] = useState([]);
  const [detail, setDetail] = useState(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [genNote, setGenNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');
  /** @type {Record<string, { packs: string, qty: string }>} */
  const [receiveInputs, setReceiveInputs] = useState({});
  const [receiptPreview, setReceiptPreview] = useState(null);

  useEffect(() => {
    fetchBranches()
      .then((b) => {
        setBranches(Array.isArray(b) ? b : []);
        if (b?.[0]?.id) setBranchId(b[0].id);
      })
      .catch((e) => setErr(e.message || String(e)));
  }, []);

  const refreshSnapshot = useCallback(() => {
    if (!branchId || !dayDate) return Promise.resolve();
    return fetchPurchaseNeedSnapshot(branchId, dayDate)
      .then(setSnapshot)
      .catch((e) => {
        setSnapshot(null);
        setErr(e.message || String(e));
      });
  }, [branchId, dayDate]);

  const refreshList = useCallback(() => {
    if (!branchId || !dayDate) return Promise.resolve();
    return fetchPurchaseDrafts(branchId, dayDate)
      .then((list) => setDraftList(Array.isArray(list) ? list : []))
      .catch((e) => setErr(e.message || String(e)));
  }, [branchId, dayDate]);

  const loadAll = useCallback(() => {
    setErr('');
    setLoading(true);
    Promise.all([refreshSnapshot(), refreshList()])
      .catch((e) => setErr(e.message || String(e)))
      .finally(() => setLoading(false));
  }, [refreshSnapshot, refreshList]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const openDetail = (id) => {
    setErr('');
    setInfo('');
    setReceiptPreview(null);
    fetchPurchaseDraft(id)
      .then((d) => {
        setDetail(d);
        setNoteDraft(d.note || '');
        const next = {};
        for (const ln of d.lines || []) {
          next[ln.id] = { packs: '', qty: '' };
        }
        setReceiveInputs(next);
      })
      .catch((e) => setErr(e.message || String(e)));
  };

  const buildReceiveLinesPayload = () => {
    if (!detail?.lines) return [];
    const out = [];
    for (const ln of detail.lines) {
      const inp = receiveInputs[ln.id] || { packs: '', qty: '' };
      const hasPack = ln.packQuantity != null && Number(ln.packQuantity) > 0;
      if (hasPack) {
        const p = inp.packs.trim();
        if (p === '') continue;
        const n = Number(p);
        if (!Number.isInteger(n) || n < 0) continue;
        out.push({ purchaseDraftLineId: ln.id, receivedPacks: n });
      } else {
        const q = inp.qty.trim();
        if (q === '') continue;
        const n = Number(String(q).replace(',', '.'));
        if (!Number.isFinite(n) || n < 0) continue;
        out.push({ purchaseDraftLineId: ln.id, receivedQuantity: n });
      }
    }
    return out;
  };

  const onReceivePreview = async () => {
    if (!detail?.id) return;
    const lines = buildReceiveLinesPayload();
    setErr('');
    setInfo('');
    setLoading(true);
    try {
      const data = await postPurchaseDraftReceive(detail.id, { lines, confirm: false });
      setReceiptPreview({ ...data, _requestSnapshot: JSON.stringify(lines) });
    } catch (e) {
      setErr(e.message || String(e));
      setReceiptPreview(null);
    } finally {
      setLoading(false);
    }
  };

  const onReceiveConfirm = async () => {
    if (!detail?.id) return;
    const lines = buildReceiveLinesPayload();
    setErr('');
    setInfo('');
    setLoading(true);
    try {
      const data = await postPurchaseDraftReceive(detail.id, { lines, confirm: true });
      setInfo(
        `Приёмка проведена: движений RECEIPT ${data.createdMovementCount}. Статус: ${receiptStatusRu[data.receiptStatus] || data.receiptStatus}.`
      );
      setReceiptPreview(null);
      const inputsReset = {};
      for (const ln of data.draft?.lines || []) {
        inputsReset[ln.id] = { packs: '', qty: '' };
      }
      setReceiveInputs(inputsReset);
      setDetail(data.draft);
      setNoteDraft(data.draft.note || '');
      await refreshList();
    } catch (e) {
      setErr(e.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  const receiptPreviewStale =
    Boolean(receiptPreview) &&
    JSON.stringify(buildReceiveLinesPayload()) !== (receiptPreview._requestSnapshot || '');

  const onGenerate = async () => {
    if (!branchId || !dayDate) return;
    setErr('');
    setInfo('');
    setLoading(true);
    try {
      const d = await generatePurchaseDraft({
        branchId,
        date: dayDate,
        note: genNote.trim() || null
      });
      setInfo(`Черновик создан: ${d.id.slice(0, 8)}…, строк ${d.lines?.length ?? 0}.`);
      setGenNote('');
      setDetail(d);
      setNoteDraft(d.note || '');
      await refreshSnapshot();
      await refreshList();
    } catch (e) {
      setErr(e.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  const onSaveNote = async () => {
    if (!detail?.id) return;
    setErr('');
    setInfo('');
    setLoading(true);
    try {
      const d = await patchPurchaseDraftNote(detail.id, noteDraft.trim() || null);
      setDetail(d);
      setInfo('Примечание сохранено.');
      await refreshList();
    } catch (e) {
      setErr(e.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  const s = snapshot?.summary;

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 1200, margin: '0 auto', padding: 24 }}>
      <h1 style={{ marginTop: 0 }}>Черновики закупки</h1>
      <p style={{ color: '#555', marginTop: 0 }}>
        Сохранённый снимок потребности в закупке на момент генерации (офферы и количества <strong>заморожены</strong> в строках).
        Нет заказов поставщику и приёмки. При <strong>нуле</strong> строк потребности создание черновика отклоняется.
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
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
          <label style={{ fontSize: 14 }}>
            Филиал
            <select
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              style={{ display: 'block', marginTop: 4, minWidth: 220, padding: 8 }}
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          <label style={{ fontSize: 14 }}>
            Дата меню / доставки
            <input
              type="date"
              value={dayDate}
              onChange={(e) => setDayDate(e.target.value)}
              style={{ display: 'block', marginTop: 4, padding: 8 }}
            />
          </label>
          <button type="button" onClick={loadAll} disabled={loading || !branchId} style={{ padding: '8px 16px' }}>
            {loading ? '…' : 'Обновить снимок и список'}
          </button>
        </div>
      </div>

      {snapshot && s ? (
        <div style={{ ...cardStyle(), background: '#fff8e1', borderColor: '#ffcc80' }}>
          <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>Текущий снимок «К закупке»</h2>
          <p style={{ margin: '0 0 12px', fontSize: 14 }}>
            Строк к закупке: <strong>{s.purchaseNeedLineCount}</strong> · оценка офферов:{' '}
            <code>{snapshot.evaluatedAt}</code>
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
            <label style={{ fontSize: 14 }}>
              Примечание к черновику
              <input
                value={genNote}
                onChange={(e) => setGenNote(e.target.value)}
                placeholder="необязательно"
                style={{ display: 'block', marginTop: 4, padding: 8, minWidth: 260 }}
              />
            </label>
            <button
              type="button"
              onClick={onGenerate}
              disabled={loading || s.purchaseNeedLineCount === 0}
              style={{ padding: '10px 18px', fontWeight: 600 }}
            >
              Создать черновик из снимка
            </button>
          </div>
          {s.purchaseNeedLineCount === 0 ? (
            <p style={{ color: '#e65100', marginBottom: 0, fontSize: 13 }}>
              Нет дефицита — сервер не создаст пустой черновик.
            </p>
          ) : null}
        </div>
      ) : null}

      <div style={cardStyle()}>
        <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>Сохранённые черновики на дату</h2>
        {draftList.length === 0 ? (
          <p style={{ color: '#888' }}>Пока нет черновиков.</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {draftList.map((d) => (
              <li key={d.id} style={{ marginBottom: 8 }}>
                <button
                  type="button"
                  onClick={() => openDetail(d.id)}
                  style={{
                    textAlign: 'left',
                    padding: 10,
                    border: detail?.id === d.id ? '2px solid #1976d2' : '1px solid #ddd',
                    borderRadius: 8,
                    background: detail?.id === d.id ? '#e3f2fd' : '#fff',
                    cursor: 'pointer',
                    width: '100%'
                  }}
                >
                  <strong>{new Date(d.createdAt).toLocaleString('ru-RU')}</strong>
                  <span style={{ marginLeft: 12, color: '#666' }}>
                    строк: {d.lineCount} · {receiptStatusRu[d.receiptStatus] || d.receiptStatus} ·{' '}
                    {d.note ? `«${d.note.slice(0, 40)}»` : 'без примечания'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {detail ? (
        <div style={cardStyle()}>
          <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>Черновик</h2>
          <p style={{ fontSize: 13, color: '#555' }}>
            Филиал: <strong>{detail.branchName}</strong> · дата: <code>{detail.date}</code> · черновик:{' '}
            <code>{detail.status}</code>
            <br />
            <strong>{receiptStatusRu[detail.receiptStatus] || detail.receiptStatus}</strong>
            {detail.lastReceivedAt ? (
              <>
                {' '}
                · последняя приёмка: <code>{detail.lastReceivedAt}</code>
              </>
            ) : null}
            <br />
            Оценка офферов при генерации: <code>{detail.sourceEvaluatedAt}</code>
          </p>
          <div style={{ marginBottom: 16, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
            <label style={{ fontSize: 14 }}>
              Примечание
              <input
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                style={{ display: 'block', marginTop: 4, padding: 8, minWidth: 280 }}
              />
            </label>
            <button type="button" onClick={onSaveNote} disabled={loading} style={{ padding: '8px 14px' }}>
              Сохранить примечание
            </button>
          </div>

          <div style={{ marginBottom: 12, padding: 12, background: '#e8eaf6', borderRadius: 8 }}>
            <strong>Итого по строкам с оценкой:</strong> {rubKopeks(detail.totalEstimatedCostKopeks)} (
            {detail.linesWithCostCount} из {detail.lines?.length ?? 0} строк)
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>
                  <th style={{ padding: '8px 6px' }}>Ингредиент</th>
                  <th style={{ padding: '8px 6px' }}>Ед.</th>
                  <th style={{ padding: '8px 6px' }}>К закупке</th>
                  <th style={{ padding: '8px 6px' }}>Поставщик</th>
                  <th style={{ padding: '8px 6px' }}>Упак.</th>
                  <th style={{ padding: '8px 6px' }}>Упак. шт.</th>
                  <th style={{ padding: '8px 6px' }}>Оценка</th>
                  <th style={{ padding: '8px 6px' }}>Принято</th>
                  <th style={{ padding: '8px 6px' }}>Остаток потр.</th>
                </tr>
              </thead>
              <tbody>
                {detail.lines.map((ln) => (
                  <tr key={ln.id} style={{ borderBottom: '1px solid #eee', background: ln.missingOffer ? '#fafafa' : undefined }}>
                    <td style={{ padding: '8px 6px' }}>
                      <strong>{ln.ingredientName}</strong>
                    </td>
                    <td style={{ padding: '8px 6px' }}>
                      <code>{ln.unitCode}</code>
                      <span style={{ fontSize: 11, color: '#666', marginLeft: 4 }}>{ln.unitDisplayName}</span>
                    </td>
                    <td style={{ padding: '8px 6px' }}>{fmtQty(ln.purchaseNeedQty)}</td>
                    <td style={{ padding: '8px 6px' }}>
                      {ln.missingOffer ? (
                        <span style={{ color: '#999', fontSize: 12 }}>Нет оффера</span>
                      ) : (
                        ln.supplierName
                      )}
                    </td>
                    <td style={{ padding: '8px 6px' }}>{ln.packQuantity != null ? fmtQty(ln.packQuantity) : '—'}</td>
                    <td style={{ padding: '8px 6px' }}>{ln.estimatedPacksNeeded ?? '—'}</td>
                    <td style={{ padding: '8px 6px', fontWeight: 600 }}>
                      {ln.estimatedBuyCostKopeks != null ? rubKopeks(ln.estimatedBuyCostKopeks) : '—'}
                    </td>
                    <td style={{ padding: '8px 6px' }}>{fmtQty(ln.receivedBaseQtyTotal)}</td>
                    <td style={{ padding: '8px 6px', color: ln.remainingNeedQty > 0 ? '#e65100' : '#2e7d32' }}>
                      {fmtQty(ln.remainingNeedQty)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ ...cardStyle(), background: '#f1f8e9', borderColor: '#c5e1a5' }}>
            <h3 style={{ marginTop: 0, fontSize: '1rem' }}>Приёмка на склад (RECEIPT)</h3>
            <p style={{ fontSize: 13, color: '#555', marginTop: 0 }}>
              Накопительная приёмка: можно несколько раз. Если в черновике есть размер упаковки — вводите{' '}
              <strong>число упаковок</strong>; иначе — количество в <strong>базовых единицах</strong>. Нули и пустые поля в
              этой партии пропускаются.
            </p>
            <div style={{ display: 'grid', gap: 10, marginBottom: 14 }}>
              {detail.lines.map((ln) => {
                const hasPack = ln.packQuantity != null && Number(ln.packQuantity) > 0;
                const inp = receiveInputs[ln.id] || { packs: '', qty: '' };
                return (
                  <div
                    key={ln.id}
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      gap: 10,
                      padding: 8,
                      background: '#fff',
                      borderRadius: 8,
                      border: '1px solid #ddd'
                    }}
                  >
                    <span style={{ minWidth: 160, fontWeight: 600 }}>{ln.ingredientName}</span>
                    {hasPack ? (
                      <label style={{ fontSize: 13 }}>
                        Упаковок принять
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={inp.packs}
                          onChange={(e) =>
                            setReceiveInputs((prev) => ({
                              ...prev,
                              [ln.id]: { ...inp, packs: e.target.value }
                            }))
                          }
                          style={{ display: 'block', marginTop: 4, width: 100, padding: 6 }}
                        />
                      </label>
                    ) : (
                      <label style={{ fontSize: 13 }}>
                        Баз. ед. принять
                        <input
                          type="number"
                          min={0}
                          step="any"
                          value={inp.qty}
                          onChange={(e) =>
                            setReceiveInputs((prev) => ({
                              ...prev,
                              [ln.id]: { ...inp, qty: e.target.value }
                            }))
                          }
                          style={{ display: 'block', marginTop: 4, width: 120, padding: 6 }}
                        />
                      </label>
                    )}
                    <span style={{ fontSize: 12, color: '#666' }}>
                      уже: {fmtQty(ln.receivedBaseQtyTotal)} / нужно: {fmtQty(ln.purchaseNeedQty)}
                    </span>
                  </div>
                );
              })}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
              <button type="button" onClick={onReceivePreview} disabled={loading} style={{ padding: '10px 16px' }}>
                Предпросмотр приёмки
              </button>
              <button
                type="button"
                onClick={onReceiveConfirm}
                disabled={loading || !receiptPreview || receiptPreviewStale}
                style={{
                  padding: '10px 16px',
                  fontWeight: 700,
                  background: receiptPreview && !receiptPreviewStale ? '#2e7d32' : '#ccc',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  cursor: receiptPreview && !receiptPreviewStale ? 'pointer' : 'not-allowed'
                }}
              >
                Подтвердить приёмку
              </button>
              {receiptPreviewStale ? (
                <span style={{ color: '#e65100', fontSize: 13 }}>Изменили ввод — снова «Предпросмотр».</span>
              ) : null}
            </div>

            {receiptPreview ? (
              <div style={{ marginTop: 16, padding: 12, background: '#fff', borderRadius: 8, border: '1px solid #ccc' }}>
                <strong>Предпросмотр:</strong> статус после проводки —{' '}
                <code>{receiptPreview.receiptStatusAfter}</code>, движений: {receiptPreview.createdMovementCount}
                <ul style={{ fontSize: 13, marginBottom: 0 }}>
                  {(receiptPreview.lines || [])
                    .filter((x) => x.deltaBaseQty > 0)
                    .map((x) => (
                      <li key={x.purchaseDraftLineId}>
                        {x.ingredientName}: +{fmtQty(x.deltaBaseQty)} (всего будет {fmtQty(x.newReceivedBaseQtyTotal)},
                        остаток потребности {fmtQty(x.remainingNeedQty)})
                      </li>
                    ))}
                </ul>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
