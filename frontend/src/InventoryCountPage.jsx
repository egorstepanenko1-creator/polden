import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchBranches,
  fetchInventoryCountBatch,
  fetchInventoryCountBatches,
  fetchInventoryCountSheet,
  postInventoryReconcile
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

function rowKey(r) {
  return `${r.ingredientId}\t${r.unitId}`;
}

function fmtQty(n) {
  if (n == null || Number.isNaN(n)) return '—';
  return Number(n).toLocaleString('ru-RU', { maximumFractionDigits: 6 });
}

function parseQty(s) {
  const t = String(s ?? '').trim().replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function movementLabel(t) {
  if (t === 'ADJUSTMENT_IN') return 'ADJUSTMENT_IN (+)';
  if (t === 'ADJUSTMENT_OUT') return 'ADJUSTMENT_OUT (−)';
  return '—';
}

export function InventoryCountPage() {
  const [branches, setBranches] = useState([]);
  const [branchId, setBranchId] = useState('');
  const [sheet, setSheet] = useState(null);
  /** @type {Record<string, string>} */
  const [countedInputs, setCountedInputs] = useState({});
  const [reconcileNote, setReconcileNote] = useState('');
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');
  const [batchList, setBatchList] = useState([]);
  const [batchDetail, setBatchDetail] = useState(null);
  const [batchDetailLoading, setBatchDetailLoading] = useState(false);

  const loadBatches = useCallback(async () => {
    if (!branchId) return;
    try {
      const list = await fetchInventoryCountBatches(branchId);
      setBatchList(Array.isArray(list) ? list : []);
    } catch {
      setBatchList([]);
    }
  }, [branchId]);

  useEffect(() => {
    fetchBranches()
      .then((b) => {
        setBranches(Array.isArray(b) ? b : []);
        if (b?.[0]?.id) setBranchId(b[0].id);
      })
      .catch((e) => setErr(e.message || String(e)));
  }, []);

  useEffect(() => {
    loadBatches();
    setBatchDetail(null);
  }, [branchId, loadBatches]);

  const buildRowsPayload = useCallback(() => {
    if (!sheet?.rows?.length) return { ok: true, rows: [] };
    const rows = [];
    for (const r of sheet.rows) {
      const k = rowKey(r);
      const counted = parseQty(countedInputs[k]);
      if (counted == null) {
        return { ok: false, message: `Укажите факт (число ≥ 0) для «${r.ingredientName}»` };
      }
      if (counted < 0) {
        return { ok: false, message: `Факт не может быть отрицательным: «${r.ingredientName}»` };
      }
      rows.push({
        ingredientId: r.ingredientId,
        unitId: r.unitId,
        countedQty: counted
      });
    }
    return { ok: true, rows };
  }, [sheet, countedInputs]);

  const buildReconcileBody = useCallback(
    (confirm) => {
      const built = buildRowsPayload();
      if (!built.ok) return { ok: false, message: built.message };
      return {
        ok: true,
        body: {
          branchId,
          rows: built.rows,
          confirm,
          note: reconcileNote.trim() || null
        }
      };
    },
    [branchId, buildRowsPayload, reconcileNote]
  );

  const previewStale = useMemo(() => {
    if (!preview?._requestSnapshot) return false;
    const built = buildReconcileBody(false);
    if (!built.ok) return true;
    return JSON.stringify(built.body) !== preview._requestSnapshot;
  }, [preview, buildReconcileBody]);

  const loadSheet = async (opts = {}) => {
    const silent = opts.silent === true;
    if (!branchId) return;
    if (!silent) {
      setErr('');
      setInfo('');
      setPreview(null);
      setLoading(true);
    }
    try {
      const data = await fetchInventoryCountSheet(branchId);
      setSheet(data);
      const next = {};
      for (const r of data.rows || []) {
        next[rowKey(r)] = String(r.systemBalanceQty);
      }
      setCountedInputs(next);
      if (!silent && !data.rows?.length) {
        setInfo(
          'В каталоге нет активных ингредиентов — добавьте их в Kitchen Lab. Учётный остаток по позициям без движений в журнале показывается как 0.'
        );
      }
    } catch (e) {
      setErr(e.message || String(e));
      if (!silent) setSheet(null);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const onPreview = async () => {
    if (!branchId || !sheet?.rows?.length) return;
    setErr('');
    setInfo('');
    const built = buildReconcileBody(false);
    if (!built.ok) {
      setErr(built.message);
      return;
    }
    setLoading(true);
    try {
      const data = await postInventoryReconcile(built.body);
      setPreview({ ...data, _requestSnapshot: JSON.stringify(built.body) });
    } catch (e) {
      setErr(e.message || String(e));
      setPreview(null);
    } finally {
      setLoading(false);
    }
  };

  const onConfirm = async () => {
    if (!branchId || !sheet?.rows?.length) return;
    setErr('');
    setInfo('');
    const built = buildReconcileBody(true);
    if (!built.ok) {
      setErr(built.message);
      return;
    }
    setLoading(true);
    try {
      const data = await postInventoryReconcile(built.body);
      const bid = data.inventoryCountBatchId;
      setInfo(
        `Сверка записана: партия инвентаризации ${bid ? `id ${bid}` : ''}. Движений: ${data.summary?.createdMovementCount ?? 0} (в+: ${data.summary?.adjustmentInCount ?? 0}, в−: ${data.summary?.adjustmentOutCount ?? 0}).`
      );
      setPreview(null);
      setReconcileNote('');
      await loadSheet({ silent: true });
      await loadBatches();
    } catch (e) {
      setErr(e.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  const openBatch = async (id) => {
    setBatchDetail(null);
    setBatchDetailLoading(true);
    setErr('');
    try {
      const d = await fetchInventoryCountBatch(id);
      setBatchDetail(d);
    } catch (e) {
      setErr(e.message || String(e));
    } finally {
      setBatchDetailLoading(false);
    }
  };

  const rows = sheet?.rows || [];

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 1100, margin: '0 auto', padding: 24 }}>
      <h1 style={{ marginTop: 0 }}>Инвентаризация и сверка</h1>
      <p style={{ color: '#555', marginTop: 0 }}>
        Лист: все <strong>активные</strong> ингредиенты каталога; учётный остаток из журнала движений (если движений не было — 0). После подтверждения создаётся партия инвентаризации в системе и при необходимости
        корректирующие движения на складе (типы прихода/расхода в журнале).
      </p>

      <div style={{ ...cardStyle(), display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
        <label>
          Филиал
          <select
            value={branchId}
            onChange={(e) => {
              setBranchId(e.target.value);
              setSheet(null);
              setPreview(null);
            }}
            style={{ display: 'block', marginTop: 4, minWidth: 220, padding: 8 }}
          >
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={() => loadSheet()} disabled={loading || !branchId} style={{ padding: '10px 16px' }}>
          Загрузить лист пересчёта
        </button>
        <button type="button" onClick={() => loadBatches()} disabled={!branchId} style={{ padding: '10px 16px' }}>
          Обновить список партий
        </button>
      </div>

      {err ? (
        <div style={{ color: '#b00020', marginBottom: 12 }} role="alert">
          {err}
        </div>
      ) : null}
      {info ? (
        <div style={{ color: '#2e7d32', marginBottom: 12 }} role="status">
          {info}
        </div>
      ) : null}

      {rows.length > 0 ? (
        <>
          <div style={cardStyle()}>
            <label style={{ display: 'block', marginBottom: 10, fontSize: 14 }}>
              Примечание к партии (опционально; в note движений и в записи партии)
              <input
                type="text"
                value={reconcileNote}
                onChange={(e) => setReconcileNote(e.target.value)}
                maxLength={500}
                style={{ display: 'block', marginTop: 6, width: '100%', maxWidth: 480, padding: 8 }}
              />
            </label>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                <thead>
                  <tr style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>
                    <th style={{ padding: '8px 6px' }}>Ингредиент</th>
                    <th style={{ padding: '8px 6px' }}>Ед.</th>
                    <th style={{ padding: '8px 6px' }}>Учётный остаток</th>
                    <th style={{ padding: '8px 6px' }}>Факт (пересчёт)</th>
                    <th style={{ padding: '8px 6px' }}>Разница</th>
                    <th style={{ padding: '8px 6px' }}>Тип корректировки</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const k = rowKey(r);
                    const sys = Number(r.systemBalanceQty);
                    const cnt = parseQty(countedInputs[k]);
                    const diff = cnt != null ? cnt - sys : null;
                    let sug = null;
                    if (diff != null) {
                      if (diff > 1e-9) sug = 'ADJUSTMENT_IN';
                      else if (diff < -1e-9) sug = 'ADJUSTMENT_OUT';
                    }
                    return (
                      <tr key={k} style={{ borderBottom: '1px solid #eee' }}>
                        <td style={{ padding: '8px 6px' }}>
                          <strong>{r.ingredientName}</strong>
                        </td>
                        <td style={{ padding: '8px 6px' }}>
                          <code>{r.unitCode}</code>{' '}
                          <span style={{ fontSize: 12, color: '#666' }}>{r.unitDisplayName}</span>
                        </td>
                        <td style={{ padding: '8px 6px' }}>{fmtQty(sys)}</td>
                        <td style={{ padding: '8px 6px' }}>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={countedInputs[k] ?? ''}
                            onChange={(e) =>
                              setCountedInputs((prev) => ({
                                ...prev,
                                [k]: e.target.value
                              }))
                            }
                            style={{ width: 120, padding: 6 }}
                          />
                        </td>
                        <td style={{ padding: '8px 6px', color: diff > 0 ? '#2e7d32' : diff < 0 ? '#c62828' : '#666' }}>
                          {diff != null ? fmtQty(diff) : '—'}
                        </td>
                        <td style={{ padding: '8px 6px' }}>
                          <code style={{ fontSize: 12 }}>{movementLabel(sug)}</code>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 16 }}>
            <button type="button" onClick={onPreview} disabled={loading} style={{ padding: '10px 16px' }}>
              Предпросмотр сверки
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={loading || !preview || previewStale}
              style={{
                padding: '10px 16px',
                fontWeight: 700,
                background: preview && !previewStale ? '#1565c0' : '#ccc',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                cursor: preview && !previewStale ? 'pointer' : 'not-allowed'
              }}
            >
              Подтвердить сверку
            </button>
            {previewStale ? (
              <span style={{ color: '#e65100', fontSize: 13 }}>Данные изменились — снова «Предпросмотр».</span>
            ) : null}
          </div>

          {preview ? (
            <div style={{ ...cardStyle(), background: '#e3f2fd', borderColor: '#90caf9' }}>
              <strong>Предпросмотр (учёт на момент запроса)</strong>
              <ul style={{ margin: '10px 0', fontSize: 14 }}>
                <li>
                  Строк в запросе: <strong>{preview.summary?.rowCount}</strong>
                </li>
                <li>
                  С корректировкой: <strong>{preview.summary?.changedLineCount}</strong>
                </li>
                <li>
                  ADJUSTMENT_IN: <strong>{preview.summary?.adjustmentInCount}</strong> · ADJUSTMENT_OUT:{' '}
                  <strong>{preview.summary?.adjustmentOutCount}</strong>
                </li>
                <li>
                  batchRef (превью): <code>{preview.batchRef}</code>
                </li>
              </ul>
              {(preview.movements || []).length === 0 ? (
                <p style={{ fontSize: 13, marginBottom: 8 }}>Корректирующих движений не будет — можно подтвердить для фиксации аудита без изменения журнала.</p>
              ) : (
                <>
                  <p style={{ fontSize: 13, marginBottom: 8 }}>Движения к созданию:</p>
                  <ul style={{ fontSize: 13, margin: 0, paddingLeft: 18 }}>
                    {(preview.movements || []).map((m, i) => (
                      <li key={i}>
                        <code>{m.movementType}</code> · {m.ingredientId.slice(0, 8)}… · qty {fmtQty(m.quantity)}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          ) : null}
        </>
      ) : sheet ? (
        <p style={{ color: '#666' }}>Лист пуст — нет активных ингредиентов в каталоге.</p>
      ) : null}

      <div style={{ ...cardStyle(), background: '#fff8e1', borderColor: '#ffe082' }}>
        <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>История партий инвентаризации</h2>
        {batchList.length === 0 ? (
          <p style={{ color: '#666', margin: 0 }}>Для филиала пока нет записанных партий.</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 12px' }}>
            {batchList.map((b) => (
              <li key={b.id} style={{ marginBottom: 8 }}>
                <button
                  type="button"
                  onClick={() => openBatch(b.id)}
                  style={{
                    textAlign: 'left',
                    width: '100%',
                    padding: 10,
                    border: '1px solid #ddd',
                    borderRadius: 8,
                    background: batchDetail?.id === b.id ? '#e8f5e9' : '#fff',
                    cursor: 'pointer'
                  }}
                >
                  <strong>{new Date(b.reconciledAt).toLocaleString('ru-RU')}</strong> · строк: {b.rowCount}, корр.:{' '}
                  {b.changedLineCount} (в+ {b.adjustmentInCount} / в− {b.adjustmentOutCount})
                  {b.note ? <span style={{ color: '#555' }}> · «{b.note.slice(0, 40)}»</span> : null}
                  <div style={{ fontSize: 12, color: '#666' }}>
                    <code>{b.id}</code>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}

        {batchDetailLoading ? <p style={{ color: '#666' }}>Загрузка детали…</p> : null}

        {batchDetail ? (
          <div style={{ marginTop: 12, padding: 12, background: '#fff', borderRadius: 8, border: '1px solid #ddd' }}>
            <h3 style={{ marginTop: 0, fontSize: '1rem' }}>Партия {batchDetail.id}</h3>
            <p style={{ fontSize: 13, color: '#555' }}>
              Филиал: <strong>{batchDetail.branchName}</strong> · проведено:{' '}
              <code>{batchDetail.reconciledAt}</code>
              {batchDetail.note ? (
                <>
                  {' '}
                  · примечание: <em>{batchDetail.note}</em>
                </>
              ) : null}
            </p>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>
                    <th style={{ padding: '6px 4px' }}>Ингредиент</th>
                    <th style={{ padding: '6px 4px' }}>Учёт (снимок)</th>
                    <th style={{ padding: '6px 4px' }}>Факт</th>
                    <th style={{ padding: '6px 4px' }}>Разница</th>
                    <th style={{ padding: '6px 4px' }}>Тип / qty</th>
                    <th style={{ padding: '6px 4px' }}>Движение на складе</th>
                  </tr>
                </thead>
                <tbody>
                  {(batchDetail.lines || []).map((ln) => (
                    <tr key={ln.id} style={{ borderBottom: '1px solid #eee' }}>
                      <td style={{ padding: '6px 4px' }}>{ln.ingredientName}</td>
                      <td style={{ padding: '6px 4px' }}>{fmtQty(Number(ln.systemBalanceQty))}</td>
                      <td style={{ padding: '6px 4px' }}>{fmtQty(Number(ln.countedQty))}</td>
                      <td style={{ padding: '6px 4px' }}>{fmtQty(Number(ln.differenceQty))}</td>
                      <td style={{ padding: '6px 4px' }}>
                        <code style={{ fontSize: 11 }}>{movementLabel(ln.movementType)}</code>
                        {ln.adjustmentQty != null ? ` · ${fmtQty(Number(ln.adjustmentQty))}` : ''}
                      </td>
                      <td style={{ padding: '6px 4px', fontSize: 11 }}>
                        {ln.stockMovementId ? <code>{ln.stockMovementId}</code> : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
