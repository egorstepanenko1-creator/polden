import { useCallback, useEffect, useState } from 'react';
import { fetchBranches, fetchDayEconomics } from './api.js';
import { localTomorrowISO } from './dates.js';

function rubKopeks(k) {
  return `${(Number(k || 0) / 100).toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ₽`;
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

export function DayEconomicsPage() {
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
    fetchDayEconomics(branchId, dayDate)
      .then(setData)
      .catch((e) => {
        setErr(e.message || String(e));
        setData(null);
      })
      .finally(() => setLoading(false));
  }, [branchId, dayDate]);

  const s = data?.summary;

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 1180, margin: '0 auto', padding: 24 }}>
      <h1 style={{ marginTop: 0 }}>День: продажи и себестоимость</h1>
      <p style={{ color: '#555', marginTop: 0 }}>
        Сводка по <strong>меню на дату</strong> и <strong>заказам с датой доставки</strong> на эту же дату. Себестоимость — только из замороженного снимка на строке меню × фактическое количество; без снимка оценку не показываем.
      </p>

      {err ? (
        <div style={{ color: '#b00020', marginBottom: 12, padding: 12, background: '#fff5f5', borderRadius: 8 }} role="alert">
          {err}
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
            Дата (меню = доставка)
            <input
              type="date"
              value={dayDate}
              onChange={(e) => setDayDate(e.target.value)}
              style={{ display: 'block', marginTop: 4, padding: 8 }}
            />
          </label>
          <button type="button" onClick={load} disabled={loading || !branchId} style={{ padding: '8px 16px' }}>
            {loading ? 'Загрузка…' : 'Загрузить'}
          </button>
        </div>
      </div>

      {data && s ? (
        <>
          <div style={{ ...cardStyle(), background: '#f5f9ff', borderColor: '#bbdefb' }} aria-labelledby="day-sum">
            <h2 id="day-sum" style={{ marginTop: 0, fontSize: '1.05rem' }}>
              Итого за день
            </h2>
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
                <div style={{ fontWeight: 700 }}>{s.activeSlotCount}</div>
              </div>
              <div>
                <div style={{ color: '#666', fontSize: 12 }}>Всего порций заказано</div>
                <div style={{ fontWeight: 700 }}>{s.totalOrderedQty}</div>
              </div>
              <div>
                <div style={{ color: '#666', fontSize: 12 }}>Выручка (оценка по меню)</div>
                <div style={{ fontWeight: 700 }}>{rubKopeks(s.totalRevenueKopeks)}</div>
                <div style={{ fontSize: 11, color: '#888' }}>Σ (цена слота × qty)</div>
              </div>
              <div>
                <div style={{ color: '#666', fontSize: 12 }}>Σ себестоимость (оценка)</div>
                <div style={{ fontWeight: 700 }}>{rubKopeks(s.totalEstimatedFoodCostKopeks)}</div>
                <div style={{ fontSize: 11, color: '#888' }}>только слоты со снимком</div>
              </div>
              <div>
                <div style={{ color: '#666', fontSize: 12 }}>Σ брутто-маржа (оценка)</div>
                <div
                  style={{
                    fontWeight: 700,
                    color: s.totalEstimatedGrossMarginKopeks < 0 ? '#b00020' : '#1b5e20'
                  }}
                >
                  {rubKopeks(s.totalEstimatedGrossMarginKopeks)}
                </div>
              </div>
              <div>
                <div style={{ color: '#666', fontSize: 12 }}>Продано без снимка себест.</div>
                <div style={{ fontWeight: 700, color: s.soldPositionsWithoutSnapshotCount ? '#e65100' : undefined }}>
                  {s.soldPositionsWithoutSnapshotCount} поз.
                </div>
              </div>
            </div>
          </div>

          <div style={cardStyle()}>
            <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>По позициям меню</h2>
            {data.positions.length === 0 ? (
              <p style={{ color: '#888' }}>Нет строк меню на эту дату.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>
                      <th style={{ padding: '8px 6px' }}>#</th>
                      <th style={{ padding: '8px 6px' }}>Название</th>
                      <th style={{ padding: '8px 6px' }}>Цена</th>
                      <th style={{ padding: '8px 6px' }}>Заказано</th>
                      <th style={{ padding: '8px 6px' }}>Выручка</th>
                      <th style={{ padding: '8px 6px' }}>Себест. / порция</th>
                      <th style={{ padding: '8px 6px' }}>Σ себест.</th>
                      <th style={{ padding: '8px 6px' }}>Маржа (оц.)</th>
                      <th style={{ padding: '8px 6px' }}>Статус</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.positions.map((p) => {
                      const warnSoldNoSnap = p.orderedQty > 0 && p.economicsStatus === 'missing_snapshot';
                      return (
                        <tr
                          key={p.menuDayItemId}
                          style={{
                            borderBottom: '1px solid #eee',
                            background: warnSoldNoSnap ? '#fff8e1' : undefined
                          }}
                        >
                          <td style={{ padding: '8px 6px' }}>{p.position}</td>
                          <td style={{ padding: '8px 6px', maxWidth: 200 }}>
                            <strong>{p.name}</strong>
                          </td>
                          <td style={{ padding: '8px 6px', whiteSpace: 'nowrap' }}>{rubKopeks(p.price)}</td>
                          <td style={{ padding: '8px 6px' }}>{p.orderedQty}</td>
                          <td style={{ padding: '8px 6px', whiteSpace: 'nowrap' }}>{rubKopeks(p.revenueKopeks)}</td>
                          <td style={{ padding: '8px 6px', whiteSpace: 'nowrap' }}>
                            {p.foodCostKopeksSnapshot != null ? rubKopeks(p.foodCostKopeksSnapshot) : '—'}
                          </td>
                          <td style={{ padding: '8px 6px', whiteSpace: 'nowrap' }}>
                            {p.estimatedFoodCostKopeks != null ? rubKopeks(p.estimatedFoodCostKopeks) : '—'}
                          </td>
                          <td
                            style={{
                              padding: '8px 6px',
                              whiteSpace: 'nowrap',
                              fontWeight: 600,
                              color:
                                p.estimatedGrossMarginKopeks == null
                                  ? '#888'
                                  : p.estimatedGrossMarginKopeks >= 0
                                    ? '#1b5e20'
                                    : '#b00020'
                            }}
                          >
                            {p.estimatedGrossMarginKopeks != null ? rubKopeks(p.estimatedGrossMarginKopeks) : '—'}
                          </td>
                          <td style={{ padding: '8px 6px' }}>
                            {p.economicsStatus === 'complete' ? (
                              <span
                                style={{
                                  fontSize: 11,
                                  padding: '2px 8px',
                                  borderRadius: 999,
                                  background: '#e8f5e9',
                                  color: '#1b5e20',
                                  fontWeight: 600
                                }}
                              >
                                Снимок есть
                              </span>
                            ) : (
                              <span
                                style={{
                                  fontSize: 11,
                                  padding: '2px 8px',
                                  borderRadius: 999,
                                  background: warnSoldNoSnap ? '#ffe0b2' : '#eceff1',
                                  color: warnSoldNoSnap ? '#e65100' : '#455a64',
                                  fontWeight: 600
                                }}
                              >
                                {warnSoldNoSnap ? 'Продажи без снимка' : 'Нет снимка'}
                              </span>
                            )}
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
