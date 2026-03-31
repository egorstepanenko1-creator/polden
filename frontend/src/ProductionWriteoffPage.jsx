import { useCallback, useEffect, useState } from 'react';
import {
  fetchBranches,
  fetchDayProductionRequirements,
  fetchProductionStockGap,
  fetchProductionWriteoffBatch,
  fetchProductionWriteoffBatches,
  postProductionWriteoff
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

const invalidReasonRu = {
  version_not_found: 'версия не найдена',
  not_published: 'не опубликован',
  empty_composition: 'пустой состав',
  unit_mismatch: 'единица ≠ default ингредиента',
  invalid_quantity: 'некорректное кол-во в строке рецепта'
};

function statusLabel(status, invalidReason) {
  const ir = invalidReason ? invalidReasonRu[invalidReason] || invalidReason : '';
  switch (status) {
    case 'not_sold':
      return { text: 'Нет заказов', tone: '#78909c', bg: '#eceff1' };
    case 'producible':
      return { text: 'Рецепт OK', tone: '#1b5e20', bg: '#e8f5e9' };
    case 'sold_without_recipe':
      return { text: 'Без рецепта', tone: '#e65100', bg: '#ffe0b2' };
    case 'invalid_recipe':
      return {
        text: ir ? `Рецепт недоступен: ${ir}` : 'Рецепт недоступен',
        tone: '#b71c1c',
        bg: '#ffebee'
      };
    default:
      return { text: status, tone: '#666', bg: '#eee' };
  }
}

export function ProductionWriteoffPage() {
  const [branches, setBranches] = useState([]);
  const [branchId, setBranchId] = useState('');
  const [dayDate, setDayDate] = useState(localTomorrowISO);
  const [prod, setProd] = useState(null);
  const [writeoffByItemId, setWriteoffByItemId] = useState({});
  const [loading, setLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [err, setErr] = useState('');
  const [preview, setPreview] = useState(null);
  const [success, setSuccess] = useState('');
  const [gapHint, setGapHint] = useState(null);
  const [writeoffNote, setWriteoffNote] = useState('');
  const [batchList, setBatchList] = useState([]);
  const [batchDetail, setBatchDetail] = useState(null);
  const [batchDetailLoading, setBatchDetailLoading] = useState(false);

  useEffect(() => {
    fetchBranches()
      .then((b) => {
        setBranches(Array.isArray(b) ? b : []);
        if (b?.[0]?.id) setBranchId(b[0].id);
      })
      .catch((e) => setErr(e.message || String(e)));
  }, []);

  const loadBatches = useCallback(() => {
    if (!branchId || !dayDate) return;
    fetchProductionWriteoffBatches(branchId, dayDate)
      .then((list) => setBatchList(Array.isArray(list) ? list : []))
      .catch(() => setBatchList([]));
  }, [branchId, dayDate]);

  const loadProd = useCallback(() => {
    if (!branchId || !dayDate) return;
    setLoading(true);
    setErr('');
    setSuccess('');
    setPreview(null);
    setGapHint(null);
    setBatchDetail(null);
    fetchDayProductionRequirements(branchId, dayDate)
      .then((d) => {
        setProd(d);
        const next = {};
        for (const p of d.positions || []) {
          next[p.menuDayItemId] = '';
        }
        setWriteoffByItemId(next);
      })
      .catch((e) => {
        setErr(e.message || String(e));
        setProd(null);
      })
      .finally(() => setLoading(false));
  }, [branchId, dayDate]);

  useEffect(() => {
    loadBatches();
  }, [loadBatches]);

  useEffect(() => {
    loadProd();
  }, [loadProd]);

  const qtyForItem = (menuDayItemId) => {
    const raw = writeoffByItemId[menuDayItemId];
    const n = raw === '' || raw == null ? 0 : Number(String(raw).replace(',', '.'));
    return Number.isFinite(n) && n >= 0 ? n : 0;
  };

  const buildPositionsPayload = () => {
    const positions = [];
    for (const p of prod?.positions || []) {
      positions.push({ menuDayItemId: p.menuDayItemId, writeoffQty: qtyForItem(p.menuDayItemId) });
    }
    return positions;
  };

  const onPreview = async () => {
    if (!branchId || !dayDate || !prod) return;
    setPreviewLoading(true);
    setErr('');
    setSuccess('');
    setPreview(null);
    setGapHint(null);
    try {
      const data = await postProductionWriteoff({
        branchId,
        date: dayDate,
        positions: buildPositionsPayload(),
        confirm: false,
        note: writeoffNote.trim() || null
      });
      setPreview({ ...data, _noteSnapshot: writeoffNote });
    } catch (e) {
      setErr(e.message || String(e));
    } finally {
      setPreviewLoading(false);
    }
  };

  const onConfirm = async () => {
    if (!branchId || !dayDate || !prod) return;
    setConfirmLoading(true);
    setErr('');
    setSuccess('');
    setGapHint(null);
    try {
      const data = await postProductionWriteoff({
        branchId,
        date: dayDate,
        positions: buildPositionsPayload(),
        confirm: true,
        note: writeoffNote.trim() || null
      });
      const bid = data.productionWriteoffBatchId;
      setSuccess(
        `Списание проведено: партия ${bid ? `id ${bid}` : ''}, движений ${data.createdMovementCount}. Журнал Stock Desk — PRODUCTION_CONSUMPTION.`
      );
      setPreview(null);
      setWriteoffNote('');
      const gap = await fetchProductionStockGap(branchId, dayDate).catch(() => null);
      if (gap?.summary) {
        setGapHint(
          `Запас vs план на дату: позиций в потребности ${gap.summary.ingredientCount}, дефицитов ${gap.summary.shortageCount}.`
        );
      }
      loadProd();
      loadBatches();
    } catch (e) {
      setErr(e.message || String(e));
    } finally {
      setConfirmLoading(false);
    }
  };

  const previewStale =
    preview &&
    (() => {
      if (writeoffNote !== (preview._noteSnapshot ?? '')) return true;
      const fromPreview = new Map((preview.positionsDetail || []).map((d) => [d.menuDayItemId, d.writeoffQty]));
      for (const p of prod?.positions || []) {
        const q = qtyForItem(p.menuDayItemId);
        const prevQ = fromPreview.get(p.menuDayItemId) ?? 0;
        if (q !== prevQ) return true;
      }
      return false;
    })();

  const openBatchDetail = async (id) => {
    setBatchDetail(null);
    setBatchDetailLoading(true);
    try {
      const d = await fetchProductionWriteoffBatch(id);
      setBatchDetail(d);
    } catch (e) {
      setErr(e.message || String(e));
    } finally {
      setBatchDetailLoading(false);
    }
  };

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 1100, margin: '0 auto', padding: 24 }}>
      <h1 style={{ marginTop: 0 }}>Списание по производству</h1>
      <p style={{ color: '#555', marginTop: 0 }}>
        Ручное списание ингредиентов: вводите <strong>фактически отпущенные порции</strong> по слотам меню. Учитываются только
        позиции с валидным опубликованным рецептом (как в «Производство»). Автосписания по заказам нет — только после вашего
        подтверждения создаются движения <code>PRODUCTION_CONSUMPTION</code> в журнале.
      </p>

      {err ? (
        <div style={{ color: '#b00020', marginBottom: 12, padding: 12, background: '#fff5f5', borderRadius: 8 }} role="alert">
          {err}
        </div>
      ) : null}
      {success ? (
        <div style={{ marginBottom: 12, padding: 12, background: '#e8f5e9', borderRadius: 8, color: '#1b5e20' }} role="status">
          {success}
          {gapHint ? <div style={{ marginTop: 8, fontSize: 14 }}>{gapHint}</div> : null}
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
          <button type="button" onClick={loadProd} disabled={loading || !branchId} style={{ padding: '8px 16px' }}>
            {loading ? 'Загрузка…' : 'Обновить меню'}
          </button>
          <button type="button" onClick={loadBatches} disabled={!branchId || !dayDate} style={{ padding: '8px 16px' }}>
            Обновить историю партий
          </button>
        </div>
      </div>

      {prod?.positions?.length ? (
        <div style={cardStyle()}>
          <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>Слоты меню и порции к списанию</h2>
          <p style={{ color: '#666', fontSize: 13, marginTop: 0 }}>
            База производства — <strong>orderedQty</strong> / <strong>productionQty</strong>. <strong>Уже списано</strong> — сумма
            проведённых партий по этой дате; <strong>остаток</strong> = max(база − уже списано, 0). Пересписание возможно — строка
            подсвечивается.
          </p>
          <label style={{ display: 'block', marginBottom: 12, fontSize: 14 }}>
            Примечание к партии (опционально, в запись партии)
            <input
              type="text"
              value={writeoffNote}
              onChange={(e) => setWriteoffNote(e.target.value)}
              maxLength={500}
              style={{ display: 'block', marginTop: 4, width: '100%', maxWidth: 420, padding: 8 }}
            />
          </label>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>
                  <th style={{ padding: '8px 6px' }}>#</th>
                  <th style={{ padding: '8px 6px' }}>Название</th>
                  <th style={{ padding: '8px 6px' }}>Рецепт</th>
                  <th style={{ padding: '8px 6px' }}>Заказано</th>
                  <th style={{ padding: '8px 6px' }}>Уже списано</th>
                  <th style={{ padding: '8px 6px' }}>Остаток</th>
                  <th style={{ padding: '8px 6px' }}>Списать сейчас</th>
                </tr>
              </thead>
              <tbody>
                {prod.positions.map((p) => {
                  const st = statusLabel(p.productionStatus, p.invalidReason);
                  const canEdit = p.productionStatus === 'producible';
                  const already = Number(p.alreadyWrittenOffQty ?? 0);
                  const remaining = Number(p.remainingWriteoffQty ?? 0);
                  const over = Boolean(p.overWrittenOff);
                  return (
                    <tr key={p.menuDayItemId} style={{ borderBottom: '1px solid #eee' }}>
                      <td style={{ padding: '8px 6px' }}>{p.position}</td>
                      <td style={{ padding: '8px 6px' }}>
                        <strong>{p.name}</strong>
                        {p.dishName ? (
                          <div style={{ fontSize: 11, color: '#666' }}>{p.dishName}</div>
                        ) : null}
                        {over ? (
                          <div style={{ fontSize: 11, color: '#c62828', fontWeight: 600 }}>пересп. по базе заказа</div>
                        ) : null}
                      </td>
                      <td style={{ padding: '8px 6px' }}>
                        <span
                          style={{
                            fontSize: 11,
                            padding: '2px 8px',
                            borderRadius: 999,
                            background: st.bg,
                            color: st.tone,
                            fontWeight: 600
                          }}
                        >
                          {st.text}
                        </span>
                      </td>
                      <td style={{ padding: '8px 6px' }}>{fmtQty(p.orderedQty)}</td>
                      <td style={{ padding: '8px 6px' }}>{fmtQty(already)}</td>
                      <td style={{ padding: '8px 6px', color: remaining > 0 ? '#e65100' : '#2e7d32' }}>{fmtQty(remaining)}</td>
                      <td style={{ padding: '8px 6px' }}>
                        <input
                          type="number"
                          min={0}
                          step={1}
                          disabled={!canEdit}
                          value={writeoffByItemId[p.menuDayItemId] ?? ''}
                          onChange={(e) =>
                            setWriteoffByItemId((prev) => ({ ...prev, [p.menuDayItemId]: e.target.value }))
                          }
                          placeholder={canEdit ? '0' : '—'}
                          style={{ width: 100, padding: 6 }}
                          aria-label={`Списать порций: ${p.name}`}
                        />
                        {!canEdit ? (
                          <span style={{ fontSize: 11, color: '#999', marginLeft: 6 }}>только при OK рецепта</span>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: 16, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
            <button type="button" onClick={onPreview} disabled={previewLoading || loading} style={{ padding: '10px 18px' }}>
              {previewLoading ? 'Считаем…' : 'Предпросмотр списания'}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={confirmLoading || loading || !preview || previewStale}
              style={{
                padding: '10px 18px',
                fontWeight: 700,
                background: preview && !previewStale ? '#c62828' : '#ccc',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                cursor: preview && !previewStale ? 'pointer' : 'not-allowed'
              }}
            >
              {confirmLoading ? 'Проводим…' : 'Подтвердить списание'}
            </button>
            {previewStale ? (
              <span style={{ color: '#e65100', fontSize: 13 }}>Изменили порции — снова нажмите «Предпросмотр».</span>
            ) : null}
          </div>
        </div>
      ) : prod && !loading ? (
        <p style={{ color: '#888' }}>На эту дату нет слотов меню.</p>
      ) : null}

      <div style={{ ...cardStyle(), background: '#eceff1', borderColor: '#b0bec5' }}>
        <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>История партий списания (эта дата)</h2>
        {batchList.length === 0 ? (
          <p style={{ color: '#666', margin: 0 }}>Партий ещё не было.</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 12px' }}>
            {batchList.map((b) => (
              <li key={b.id} style={{ marginBottom: 8 }}>
                <button
                  type="button"
                  onClick={() => openBatchDetail(b.id)}
                  style={{
                    textAlign: 'left',
                    width: '100%',
                    padding: 10,
                    border: '1px solid #ccc',
                    borderRadius: 8,
                    background: batchDetail?.id === b.id ? '#e3f2fd' : '#fff',
                    cursor: 'pointer'
                  }}
                >
                  <strong>{new Date(b.createdAt).toLocaleString('ru-RU')}</strong> · слотов {b.affectedPositionsCount}, движений{' '}
                  {b.createdMovementCount}
                  {b.note ? <span style={{ color: '#555' }}> · «{b.note.slice(0, 40)}»</span> : null}
                  <div style={{ fontSize: 11, color: '#666' }}>
                    <code>{b.id}</code>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
        {batchDetailLoading ? <p style={{ color: '#666' }}>Загрузка детали…</p> : null}
        {batchDetail ? (
          <div style={{ padding: 12, background: '#fff', borderRadius: 8, border: '1px solid #ddd' }}>
            <h3 style={{ marginTop: 0, fontSize: '1rem' }}>Партия {batchDetail.id}</h3>
            <p style={{ fontSize: 13, color: '#555' }}>
              Слоты (порции):
              <ul style={{ margin: '6px 0', paddingLeft: 18 }}>
                {(batchDetail.lines || []).map((ln) => (
                  <li key={ln.id}>
                    #{ln.position} «{ln.menuDayItemName}» — {fmtQty(Number(ln.writeoffQty))} порц.
                  </li>
                ))}
              </ul>
            </p>
            <p style={{ fontSize: 13, fontWeight: 600 }}>Движения PRODUCTION_CONSUMPTION:</p>
            <ul style={{ fontSize: 12, margin: '6px 0', paddingLeft: 18 }}>
              {(batchDetail.movements || []).map((m) => (
                <li key={m.stockMovementId}>
                  <code>{m.stockMovementId}</code> · {m.ingredientName} · {fmtQty(Number(m.quantity))}{' '}
                  <code>{m.unitCode}</code>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      {preview?.ingredientTotals?.length ? (
        <div style={{ ...cardStyle(), background: '#fff8e1', borderColor: '#ffcc80' }}>
          <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>
            {preview.preview ? 'Предпросмотр: списание по ингредиентам' : 'Итог'}
          </h2>
          <p style={{ fontSize: 13, color: '#555' }}>
            Слотов с ненулевым списанием: <strong>{preview.affectedPositionsCount}</strong>. Строк движений в журнале:{' '}
            <strong>{preview.preview ? preview.ingredientTotals.length : preview.createdMovementCount}</strong> (одна на пару
            ингредиент + единица).
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>
                  <th style={{ padding: '8px 6px' }}>Ингредиент</th>
                  <th style={{ padding: '8px 6px' }}>Ед.</th>
                  <th style={{ padding: '8px 6px' }}>Количество к списанию</th>
                </tr>
              </thead>
              <tbody>
                {preview.ingredientTotals.map((r) => (
                  <tr key={`${r.ingredientId}-${r.unitId}`} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '8px 6px' }}>
                      <strong>{r.ingredientName}</strong>
                    </td>
                    <td style={{ padding: '8px 6px' }}>
                      <code>{r.unitCode}</code>{' '}
                      <span style={{ fontSize: 11, color: '#666' }}>{r.unitDisplayName}</span>
                    </td>
                    <td style={{ padding: '8px 6px', fontWeight: 600 }}>{fmtQty(r.quantity)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.positionsDetail?.length ? (
            <details style={{ marginTop: 12, fontSize: 12 }}>
              <summary>Детализация по слотам</summary>
              <ul>
                {preview.positionsDetail.map((d) => (
                  <li key={d.menuDayItemId}>
                    #{d.position} «{d.name}» — {d.writeoffQty} порц.
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
