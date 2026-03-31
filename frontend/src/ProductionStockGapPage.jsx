import { useCallback, useEffect, useState } from 'react';
import { fetchBranches, fetchProductionStockGap } from './api.js';
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

const statusRu = {
  enough: { label: 'Хватает', bg: '#e8f5e9', color: '#1b5e20' },
  shortage: { label: 'Не хватает', bg: '#fff3e0', color: '#e65100' },
  negative_before_production: { label: 'Уже минус на складе', bg: '#ffebee', color: '#b71c1c' }
};

export function ProductionStockGapPage() {
  const [branches, setBranches] = useState([]);
  const [branchId, setBranchId] = useState('');
  const [dayDate, setDayDate] = useState(localTomorrowISO);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    fetchBranches()
      .then((b) => {
        setBranches(Array.isArray(b) ? b : []);
        if (b?.[0]?.id) setBranchId(b[0].id);
      })
      .catch((e) => setErr(e.message || String(e)));
  }, []);

  const load = useCallback(() => {
    if (!branchId || !dayDate) return;
    setLoading(true);
    setErr('');
    fetchProductionStockGap(branchId, dayDate)
      .then(setData)
      .catch((e) => {
        setErr(e.message || String(e));
        setData(null);
      })
      .finally(() => setLoading(false));
  }, [branchId, dayDate]);

  useEffect(() => {
    load();
  }, [load]);

  const s = data?.summary;

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 1100, margin: '0 auto', padding: 24 }}>
      <h1 style={{ marginTop: 0 }}>Производство vs склад</h1>
      <p style={{ color: '#555', marginTop: 0 }}>
        Сравнение <strong>суточной потребности</strong> (как в «Производство»: заказы × валидные рецепты в меню) с{' '}
        <strong>текущими остатками</strong> по журналу Stock. Нет движений по позиции → остаток считается{' '}
        <strong>0</strong>. Резервации и ожидаемые поставки не учитываются.
      </p>

      {err ? (
        <div style={{ color: '#b00020', marginBottom: 12, padding: 12, background: '#fff5f5', borderRadius: 8 }} role="alert">
          {err}
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
            Дата доставки / меню
            <input
              type="date"
              value={dayDate}
              onChange={(e) => setDayDate(e.target.value)}
              style={{ display: 'block', marginTop: 4, padding: 8 }}
            />
          </label>
          <button type="button" onClick={load} disabled={loading || !branchId} style={{ padding: '8px 16px' }}>
            {loading ? 'Загрузка…' : 'Обновить'}
          </button>
        </div>
      </div>

      {data && s ? (
        <>
          <div style={{ ...cardStyle(), background: '#e8eaf6', borderColor: '#c5cae9' }} aria-labelledby="gap-sum">
            <h2 id="gap-sum" style={{ marginTop: 0, fontSize: '1.05rem' }}>
              Сводка
            </h2>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                gap: 12,
                fontSize: 14
              }}
            >
              <div>
                <div style={{ color: '#666', fontSize: 12 }}>Позиций в потребности</div>
                <div style={{ fontWeight: 700 }}>{s.ingredientCount}</div>
              </div>
              <div>
                <div style={{ color: '#666', fontSize: 12 }}>Строк потребности</div>
                <div style={{ fontWeight: 700 }}>{s.requiredLineCount}</div>
              </div>
              <div>
                <div style={{ color: '#666', fontSize: 12 }}>Дефицит (остаток ≥ 0)</div>
                <div style={{ fontWeight: 700, color: s.shortageCount ? '#e65100' : undefined }}>{s.shortageCount}</div>
              </div>
              <div>
                <div style={{ color: '#666', fontSize: 12 }}>Уже отрицательный склад</div>
                <div style={{ fontWeight: 700, color: s.negativeBeforeProductionCount ? '#b00020' : undefined }}>
                  {s.negativeBeforeProductionCount}
                </div>
              </div>
            </div>
          </div>

          <div style={cardStyle()}>
            <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>По ингредиентам</h2>
            {data.rows.length === 0 ? (
              <p style={{ color: '#888' }}>
                Нет агрегированной потребности на эту дату (нет продаж с валидными рецептами или меню пустое).
              </p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>
                      <th style={{ padding: '8px 6px' }}>Ингредиент</th>
                      <th style={{ padding: '8px 6px' }}>Ед.</th>
                      <th style={{ padding: '8px 6px' }}>Нужно</th>
                      <th style={{ padding: '8px 6px' }}>На складе</th>
                      <th style={{ padding: '8px 6px' }}>Запас − нужно</th>
                      <th style={{ padding: '8px 6px' }}>Статус</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((r) => {
                      const st = statusRu[r.status] || { label: r.status, bg: '#eee', color: '#333' };
                      const hot = r.status === 'shortage' || r.status === 'negative_before_production';
                      return (
                        <tr
                          key={`${r.ingredientId}-${r.unitId}`}
                          style={{
                            borderBottom: '1px solid #eee',
                            background: hot ? '#fff8e1' : undefined
                          }}
                        >
                          <td style={{ padding: '8px 6px' }}>
                            <strong>{r.ingredientName}</strong>
                          </td>
                          <td style={{ padding: '8px 6px' }}>
                            <code>{r.unitCode}</code>
                            <span style={{ fontSize: 11, color: '#666', marginLeft: 4 }}>{r.unitDisplayName}</span>
                          </td>
                          <td style={{ padding: '8px 6px' }}>{fmtQty(r.requiredQty)}</td>
                          <td style={{ padding: '8px 6px', fontWeight: 500 }}>{fmtQty(r.balanceQty)}</td>
                          <td
                            style={{
                              padding: '8px 6px',
                              fontWeight: 600,
                              color: r.gapQty < 0 ? '#b00020' : '#1b5e20'
                            }}
                          >
                            {fmtQty(r.gapQty)}
                          </td>
                          <td style={{ padding: '8px 6px' }}>
                            <span
                              style={{
                                fontSize: 11,
                                padding: '2px 8px',
                                borderRadius: 999,
                                background: st.bg,
                                color: st.color,
                                fontWeight: 600
                              }}
                            >
                              {st.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
