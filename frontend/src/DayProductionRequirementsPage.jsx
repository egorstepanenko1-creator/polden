import { useCallback, useEffect, useState } from 'react';
import { fetchBranches, fetchDayProductionRequirements } from './api.js';
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
      return { text: 'Продано без рецепта', tone: '#e65100', bg: '#ffe0b2' };
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

export function DayProductionRequirementsPage() {
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
    fetchDayProductionRequirements(branchId, dayDate)
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
      <h1 style={{ marginTop: 0 }}>Производство на день · потребность</h1>
      <p style={{ color: '#555', marginTop: 0 }}>
        Заказы с датой доставки = дата меню. Ингредиенты считаются только для проданных позиций с привязкой к{' '}
        <strong>опубликованному</strong> рецепту и валидным строкам состава (как в v1 costing: единица строки = defaultUnit
        ингредиента). Без рецепта или при ошибке состава позиция в список закупки не попадает.
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
            Дата доставки / меню
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
          <div style={{ ...cardStyle(), background: '#f3e5f5', borderColor: '#e1bee7' }} aria-labelledby="prod-sum">
            <h2 id="prod-sum" style={{ marginTop: 0, fontSize: '1.05rem' }}>
              Сводка
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
                <div style={{ color: '#666', fontSize: 12 }}>Проданных позиций</div>
                <div style={{ fontWeight: 700 }}>{s.soldSlotCount}</div>
              </div>
              <div>
                <div style={{ color: '#666', fontSize: 12 }}>С валидным рецептом</div>
                <div style={{ fontWeight: 700, color: '#1b5e20' }}>{s.linkedSoldSlotCount}</div>
              </div>
              <div>
                <div style={{ color: '#666', fontSize: 12 }}>Продано без рецепта</div>
                <div style={{ fontWeight: 700, color: s.soldMissingRecipeCount ? '#e65100' : undefined }}>
                  {s.soldMissingRecipeCount}
                </div>
              </div>
              <div>
                <div style={{ color: '#666', fontSize: 12 }}>Рецепт недоступен</div>
                <div style={{ fontWeight: 700, color: s.soldInvalidRecipeCount ? '#b00020' : undefined }}>
                  {s.soldInvalidRecipeCount}
                </div>
              </div>
              <div>
                <div style={{ color: '#666', fontSize: 12 }}>Всего порций</div>
                <div style={{ fontWeight: 700 }}>{s.totalOrderedPortions}</div>
              </div>
              <div>
                <div style={{ color: '#666', fontSize: 12 }}>Строк в списке ингредиентов</div>
                <div style={{ fontWeight: 700 }}>{s.ingredientDemandLineCount}</div>
              </div>
            </div>
          </div>

          <div style={cardStyle()}>
            <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>По позициям меню</h2>
            {data.positions.length === 0 ? (
              <p style={{ color: '#888' }}>Нет строк меню.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>
                      <th style={{ padding: '8px 6px' }}>#</th>
                      <th style={{ padding: '8px 6px' }}>В меню</th>
                      <th style={{ padding: '8px 6px' }}>Заказано</th>
                      <th style={{ padding: '8px 6px' }}>К готовке</th>
                      <th style={{ padding: '8px 6px' }}>Рецепт</th>
                      <th style={{ padding: '8px 6px' }}>Статус</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.positions.map((p) => {
                      const st = statusLabel(p.productionStatus, p.invalidReason);
                      const warn = p.orderedQty > 0 && p.productionStatus !== 'producible' && p.productionStatus !== 'not_sold';
                      return (
                        <tr
                          key={p.menuDayItemId}
                          style={{
                            borderBottom: '1px solid #eee',
                            background: warn ? '#fff8e1' : undefined
                          }}
                        >
                          <td style={{ padding: '8px 6px' }}>{p.position}</td>
                          <td style={{ padding: '8px 6px', maxWidth: 220 }}>
                            <strong>{p.name}</strong>
                            {p.dishVersionId ? (
                              <div style={{ fontSize: 11, color: '#555', wordBreak: 'break-all' }}>
                                <code>{p.dishVersionId.slice(0, 12)}…</code>
                                {p.dishName ? ` · ${p.dishName}` : null}
                              </div>
                            ) : null}
                          </td>
                          <td style={{ padding: '8px 6px' }}>{p.orderedQty}</td>
                          <td style={{ padding: '8px 6px' }}>{p.productionQty}</td>
                          <td style={{ padding: '8px 6px', fontSize: 12 }}>
                            {p.dishVersionId ? (p.dishName || '—') : '—'}
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
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div style={cardStyle()}>
            <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>Ингредиенты (агрегат за день)</h2>
            {data.ingredientDemand.length === 0 ? (
              <p style={{ color: '#888' }}>
                Нет строк — нет продаж с валидным рецептом или меню пустое.
              </p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>
                      <th style={{ padding: '8px 6px' }}>Ингредиент</th>
                      <th style={{ padding: '8px 6px' }}>Кол-во</th>
                      <th style={{ padding: '8px 6px' }}>Ед.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.ingredientDemand.map((row) => (
                      <tr key={`${row.ingredientId}-${row.unitId}`} style={{ borderBottom: '1px solid #eee' }}>
                        <td style={{ padding: '8px 6px' }}>{row.ingredientName}</td>
                        <td style={{ padding: '8px 6px', fontWeight: 600 }}>{fmtQty(row.requiredQty)}</td>
                        <td style={{ padding: '8px 6px' }}>
                          <code>{row.unitCode}</code> <span style={{ color: '#666' }}>({row.unitDisplayName})</span>
                        </td>
                      </tr>
                    ))}
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
