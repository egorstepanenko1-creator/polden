import { useCallback, useEffect, useState } from 'react';
import { fetchBranches, fetchProcurementBoard, fetchPurchaseDraft } from './api.js';

function cardStyle() {
  return {
    border: '1px solid #e0e0e0',
    borderRadius: 10,
    padding: '14px 16px',
    background: '#fafafa',
    marginBottom: 16
  };
}

function rubKopeks(k) {
  const n = Number(k || 0);
  return `${(n / 100).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₽`;
}

const receiptStatusRu = {
  NONE: 'Не принято',
  RECEIVED_PARTIAL: 'Частично',
  RECEIVED_FULL: 'Полностью'
};

function fmtQty(n) {
  if (n == null || Number.isNaN(n)) return '—';
  return Number(n).toLocaleString('ru-RU', { maximumFractionDigits: 6 });
}

export function ProcurementBoardPage() {
  const [branches, setBranches] = useState([]);
  const [filterBranchId, setFilterBranchId] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [filterReceipt, setFilterReceipt] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [payload, setPayload] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    fetchBranches()
      .then((b) => setBranches(Array.isArray(b) ? b : []))
      .catch((e) => setErr(e.message || String(e)));
  }, []);

  const loadBoard = useCallback(async () => {
    setErr('');
    setLoading(true);
    try {
      const data = await fetchProcurementBoard({
        branchId: filterBranchId || undefined,
        date: filterDate.trim() || undefined,
        receiptStatus: filterReceipt || undefined
      });
      setPayload(data);
    } catch (e) {
      setErr(e.message || String(e));
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }, [filterBranchId, filterDate, filterReceipt]);

  useEffect(() => {
    loadBoard();
  }, [loadBoard]);

  const openDetail = async (id) => {
    setSelectedId(id);
    setDetail(null);
    setDetailLoading(true);
    setErr('');
    try {
      const d = await fetchPurchaseDraft(id);
      setDetail(d);
    } catch (e) {
      setErr(e.message || String(e));
    } finally {
      setDetailLoading(false);
    }
  };

  const summary = payload?.summary;
  const drafts = payload?.drafts || [];
  const filtersApplied = payload?.filtersApplied;

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 1200, margin: '0 auto', padding: 24 }}>
      <h1 style={{ marginTop: 0 }}>Доска закупок</h1>
      <p style={{ color: '#555', marginTop: 0 }}>
        Обзор черновиков закупки и приёмки. Фильтры необязательны. Деталь строк — из API черновика; приёмка — в разделе «Черновики закупки».
      </p>

      <div style={{ ...cardStyle(), display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
        <label>
          Филиал
          <select
            value={filterBranchId}
            onChange={(e) => setFilterBranchId(e.target.value)}
            style={{ display: 'block', marginTop: 4, minWidth: 200, padding: 8 }}
          >
            <option value="">Все</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Дата меню (черновика)
          <input
            type="date"
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
            style={{ display: 'block', marginTop: 4, padding: 8 }}
          />
        </label>
        <label>
          Статус приёмки
          <select
            value={filterReceipt}
            onChange={(e) => setFilterReceipt(e.target.value)}
            style={{ display: 'block', marginTop: 4, minWidth: 180, padding: 8 }}
          >
            <option value="">Все</option>
            <option value="NONE">Не принято</option>
            <option value="RECEIVED_PARTIAL">Частично</option>
            <option value="RECEIVED_FULL">Полностью</option>
          </select>
        </label>
        <button type="button" onClick={loadBoard} disabled={loading} style={{ padding: '10px 16px' }}>
          Обновить
        </button>
      </div>

      {filtersApplied ? (
        <p style={{ fontSize: 12, color: '#666' }}>
          Применено: branchId={filtersApplied.branchId ?? '—'}, date={filtersApplied.date ?? '—'}, receiptStatus=
          {filtersApplied.receiptStatus ?? '—'}, limit={filtersApplied.limit}
        </p>
      ) : null}

      {err ? (
        <div style={{ color: '#b00020', marginBottom: 12 }} role="alert">
          {err}
        </div>
      ) : null}

      {summary ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
            gap: 12,
            marginBottom: 20
          }}
        >
          <div style={cardStyle()}>
            <div style={{ fontSize: 11, color: '#666' }}>Черновиков</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{summary.draftCount}</div>
          </div>
          <div style={cardStyle()}>
            <div style={{ fontSize: 11, color: '#666' }}>Приёмка: не начата</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{summary.noneCount}</div>
          </div>
          <div style={cardStyle()}>
            <div style={{ fontSize: 11, color: '#666' }}>Частично</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{summary.partialCount}</div>
          </div>
          <div style={cardStyle()}>
            <div style={{ fontSize: 11, color: '#666' }}>Полностью</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{summary.fullCount}</div>
          </div>
          <div style={{ ...cardStyle(), borderColor: '#ffcc80' }}>
            <div style={{ fontSize: 11, color: '#666' }}>Строк без оффера</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: summary.missingOfferLineCount > 0 ? '#e65100' : undefined }}>
              {summary.missingOfferLineCount}
            </div>
          </div>
          <div style={cardStyle()}>
            <div style={{ fontSize: 11, color: '#666' }}>Остаток оценки (по упак.)</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{rubKopeks(summary.outstandingEstimatedCostKopeks)}</div>
          </div>
        </div>
      ) : null}

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>
              <th style={{ padding: '8px 6px' }}>ID</th>
              <th style={{ padding: '8px 6px' }}>Дата</th>
              <th style={{ padding: '8px 6px' }}>Филиал</th>
              <th style={{ padding: '8px 6px' }}>Приёмка</th>
              <th style={{ padding: '8px 6px' }}>Строк</th>
              <th style={{ padding: '8px 6px' }}>Без оффера</th>
              <th style={{ padding: '8px 6px' }}>Оценка всего</th>
              <th style={{ padding: '8px 6px' }}>Остаток оценки</th>
              <th style={{ padding: '8px 6px' }}>Принято строк</th>
              <th style={{ padding: '8px 6px' }}>Осталось строк</th>
              <th style={{ padding: '8px 6px' }}>Создан</th>
              <th style={{ padding: '8px 6px' }} />
            </tr>
          </thead>
          <tbody>
            {drafts.map((d) => (
              <tr
                key={d.id}
                style={{
                  borderBottom: '1px solid #eee',
                  background: selectedId === d.id ? '#e3f2fd' : undefined
                }}
              >
                <td style={{ padding: '8px 6px', fontSize: 11 }}>
                  <code title={d.id}>{d.id.slice(0, 10)}…</code>
                </td>
                <td style={{ padding: '8px 6px' }}>
                  <code>{d.date}</code>
                </td>
                <td style={{ padding: '8px 6px' }}>{d.branchName}</td>
                <td style={{ padding: '8px 6px' }}>
                  {receiptStatusRu[d.receiptStatus] || d.receiptStatus}
                  {d.lastReceivedAt ? (
                    <div style={{ fontSize: 11, color: '#666' }}>
                      {new Date(d.lastReceivedAt).toLocaleString('ru-RU')}
                    </div>
                  ) : null}
                </td>
                <td style={{ padding: '8px 6px' }}>{d.lineCount}</td>
                <td style={{ padding: '8px 6px', fontWeight: d.missingOfferLineCount > 0 ? 700 : 400, color: d.missingOfferLineCount > 0 ? '#e65100' : undefined }}>
                  {d.missingOfferLineCount}
                </td>
                <td style={{ padding: '8px 6px' }}>{rubKopeks(d.totalEstimatedCostKopeks)}</td>
                <td style={{ padding: '8px 6px' }}>{rubKopeks(d.outstandingEstimatedCostKopeks)}</td>
                <td style={{ padding: '8px 6px' }}>{d.receivedLineCount}</td>
                <td style={{ padding: '8px 6px' }}>{d.remainingLineCount}</td>
                <td style={{ padding: '8px 6px', whiteSpace: 'nowrap' }}>
                  {new Date(d.createdAt).toLocaleString('ru-RU')}
                </td>
                <td style={{ padding: '8px 6px' }}>
                  <button type="button" onClick={() => openDetail(d.id)} style={{ padding: '6px 10px' }}>
                    Деталь
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {drafts.length === 0 && !loading ? <p style={{ color: '#666' }}>Нет черновиков по фильтру.</p> : null}

      {detailLoading ? <p style={{ color: '#666' }}>Загрузка детали…</p> : null}

      {detail ? (
        <div style={{ ...cardStyle(), marginTop: 20, background: '#f5f5f5' }}>
          <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>
            Черновик <code>{detail.id}</code>
          </h2>
          <p style={{ fontSize: 13, color: '#555' }}>
            {detail.branchName} · дата <code>{detail.date}</code> · {receiptStatusRu[detail.receiptStatus] || detail.receiptStatus} · оценка{' '}
            {rubKopeks(detail.totalEstimatedCostKopeks)}
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>
                  <th style={{ padding: '6px 4px' }}>Ингредиент</th>
                  <th style={{ padding: '6px 4px' }}>Потребность</th>
                  <th style={{ padding: '6px 4px' }}>Принято</th>
                  <th style={{ padding: '6px 4px' }}>Остаток потр.</th>
                  <th style={{ padding: '6px 4px' }}>Поставщик</th>
                  <th style={{ padding: '6px 4px' }}>Оценка закупки</th>
                  <th style={{ padding: '6px 4px' }}>Строка</th>
                </tr>
              </thead>
              <tbody>
                {(detail.lines || []).map((ln) => (
                  <tr key={ln.id} style={{ borderBottom: '1px solid #eee', background: ln.missingOffer ? '#fff8e1' : undefined }}>
                    <td style={{ padding: '6px 4px' }}>
                      <strong>{ln.ingredientName}</strong>
                    </td>
                    <td style={{ padding: '6px 4px' }}>{fmtQty(Number(ln.purchaseNeedQty))}</td>
                    <td style={{ padding: '6px 4px' }}>{fmtQty(Number(ln.receivedBaseQtyTotal))}</td>
                    <td style={{ padding: '6px 4px' }}>{fmtQty(ln.remainingNeedQty)}</td>
                    <td style={{ padding: '6px 4px' }}>
                      {ln.missingOffer ? <span style={{ color: '#e65100', fontWeight: 600 }}>Нет оффера</span> : ln.supplierName}
                    </td>
                    <td style={{ padding: '6px 4px' }}>
                      {ln.estimatedBuyCostKopeks != null ? rubKopeks(ln.estimatedBuyCostKopeks) : '—'}
                    </td>
                    <td style={{ padding: '6px 4px', fontSize: 12 }}>
                      {ln.lineReceiptComplete ? (
                        <span style={{ color: '#2e7d32' }}>по потребности</span>
                      ) : ln.remainingNeedQty > 0 ? (
                        <span style={{ color: '#c62828' }}>не закрыто</span>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
