import { useEffect, useMemo, useState } from 'react';
import {
  fetchBranches,
  fetchDailyOpsAnalytics,
  fetchDeliveryOrders,
  fetchLaunchKpis,
  patchDeliveryOrderStatus
} from './api.js';
import { localTodayISO, localTomorrowISO } from './dates.js';
import { OperatorDeliveryWorkspace } from './OperatorDeliveryWorkspace.jsx';
import { rubKopeks } from './i18n/format.js';
import { nav } from './i18n/ru.js';
import { KitchenLabPage } from './KitchenLabPage.jsx';
import { MenuDayEditorPage } from './MenuDayEditorPage.jsx';
import { DayEconomicsPage } from './DayEconomicsPage.jsx';
import { DayProductionRequirementsPage } from './DayProductionRequirementsPage.jsx';
import { StockDeskPage } from './StockDeskPage.jsx';
import { InventoryCountPage } from './InventoryCountPage.jsx';
import { ProductionStockGapPage } from './ProductionStockGapPage.jsx';
import { ProductionWriteoffPage } from './ProductionWriteoffPage.jsx';
import { PurchaseNeedSnapshotPage } from './PurchaseNeedSnapshotPage.jsx';
import { SuppliersPage } from './SuppliersPage.jsx';
import { PurchaseDraftsPage } from './PurchaseDraftsPage.jsx';
import { ProcurementBoardPage } from './ProcurementBoardPage.jsx';
import { ContentPipelinePage } from './ContentPipelinePage.jsx';
import { LaunchDrillPage } from './LaunchDrillPage.jsx';
import { VkLeadsPage } from './VkLeadsPage.jsx';
import { OrderQuickCreateModal } from './OrderQuickCreateModal.jsx';
import { DailyOpsPanel } from './DailyOpsPanel.jsx';
import { B2BWorkspacePage } from './B2BWorkspacePage.jsx';

function cardStyle() {
  return {
    border: '1px solid #e0e0e0',
    borderRadius: 10,
    padding: '14px 16px',
    background: '#fafafa'
  };
}

const crmNavWrap = {
  fontFamily: 'system-ui, sans-serif',
  padding: '12px 24px',
  borderBottom: '1px solid #e0e0e0',
  display: 'flex',
  gap: 12,
  alignItems: 'center',
  flexWrap: 'wrap'
};

/** @param {{ active: string, onNavigate: (v: string) => void }} props */
function CrmTopNav({ active, onNavigate }) {
  const tab = (id, label) => (
    <button
      type="button"
      disabled={active === id}
      onClick={() => onNavigate(id)}
      style={{
        padding: '6px 12px',
        cursor: active === id ? 'default' : 'pointer',
        fontWeight: active === id ? 600 : 400
      }}
    >
      {label}
    </button>
  );
  return (
    <nav style={crmNavWrap} aria-label="Разделы CRM">
      <strong>{nav.brand}</strong>
      {tab('crm', nav.ordersKpi)}
      {tab('contentPipeline', nav.content)}
      {tab('launchDrill', nav.launchDrill)}
      {tab('vkLeads', nav.vkLeads)}
      {tab('b2b', nav.b2b)}
      {tab('kitchen', nav.kitchen)}
      {tab('menuDay', nav.menuDay)}
      {tab('dayEconomics', nav.dayEconomics)}
      {tab('dayProduction', nav.dayProduction)}
      {tab('stockDesk', nav.stockDesk)}
      {tab('inventoryCount', nav.inventoryCount)}
      {tab('productionStockGap', nav.productionStockGap)}
      {tab('purchaseNeedSnapshot', nav.purchaseNeedSnapshot)}
      {tab('purchaseDrafts', nav.purchaseDrafts)}
      {tab('procurementBoard', nav.procurementBoard)}
      {tab('suppliers', nav.suppliers)}
      {tab('productionWriteoff', nav.productionWriteoff)}
    </nav>
  );
}

export function App() {
  const [crmView, setCrmView] = useState('crm');
  const [branches, setBranches] = useState([]);
  const [branchId, setBranchId] = useState('');
  const [date, setDate] = useState(localTomorrowISO);
  const [orders, setOrders] = useState([]);
  const [selected, setSelected] = useState(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  const [kpiDays, setKpiDays] = useState(7);
  const [kpi, setKpi] = useState(null);
  const [kpiLoading, setKpiLoading] = useState(false);
  const [kpiErr, setKpiErr] = useState('');

  const [orderModalOpen, setOrderModalOpen] = useState(false);
  const [orderPrefill, setOrderPrefill] = useState(null);
  const [statusBusyId, setStatusBusyId] = useState(null);
  const [statusErr, setStatusErr] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [searchErr, setSearchErr] = useState('');
  const [searchScoped, setSearchScoped] = useState(true);

  const [dailyOps, setDailyOps] = useState(null);
  const [dailyOpsLoading, setDailyOpsLoading] = useState(false);
  const [dailyOpsErr, setDailyOpsErr] = useState('');

  const todayStr = localTodayISO();
  const tomorrowStr = localTomorrowISO();

  useEffect(() => {
    function onOpenOrderForm(ev) {
      setOrderPrefill(ev.detail || null);
      setOrderModalOpen(true);
    }
    window.addEventListener('polden-open-order-form', onOpenOrderForm);
    return () => window.removeEventListener('polden-open-order-form', onOpenOrderForm);
  }, []);

  useEffect(() => {
    fetchBranches()
      .then((b) => {
        setBranches(Array.isArray(b) ? b : []);
        if (b?.[0]?.id) setBranchId(b[0].id);
      })
      .catch((e) => setErr(e.message || String(e)));
  }, []);

  function loadDailyOps() {
    if (!branchId) return;
    const compareDate = date === todayStr ? tomorrowStr : date === tomorrowStr ? todayStr : null;
    setDailyOpsLoading(true);
    setDailyOpsErr('');
    fetchDailyOpsAnalytics(branchId, date, compareDate || undefined)
      .then(setDailyOps)
      .catch((e) => setDailyOpsErr(e.message || String(e)))
      .finally(() => setDailyOpsLoading(false));
  }

  const loadOrders = (selectionIdToKeep = null) => {
    if (!branchId) return;
    setLoading(true);
    setErr('');
    fetchDeliveryOrders(branchId, date)
      .then((data) => {
        if (!Array.isArray(data)) {
          setErr(`Ответ delivery-orders не массив (${typeof data}). Проверьте API и VITE_API_BASE.`);
          setOrders([]);
          setSelected(null);
          return;
        }
        setOrders(data);
        if (selectionIdToKeep) {
          const found = data.find((o) => o.id === selectionIdToKeep);
          setSelected(found || null);
        } else {
          setSelected(null);
        }
        if (import.meta.env.DEV) {
          console.debug('[polden] delivery-orders', { branchId, date, count: data.length });
        }
      })
      .catch((e) => setErr(e.message || String(e)))
      .finally(() => {
        setLoading(false);
        loadDailyOps();
      });
  };

  useEffect(() => {
    if (branchId) loadOrders();
  }, [branchId, date]);

  useEffect(() => {
    if (!branchId) return;
    setKpiLoading(true);
    setKpiErr('');
    fetchLaunchKpis(branchId, kpiDays)
      .then(setKpi)
      .catch((e) => setKpiErr(e.message || String(e)))
      .finally(() => setKpiLoading(false));
  }, [branchId, kpiDays]);

  const title = useMemo(() => nav.brand, []);

  const delivToday = kpi?.byDeliveryDate?.find((r) => r.deliveryDate === todayStr);
  const delivTomorrow = kpi?.byDeliveryDate?.find((r) => r.deliveryDate === tomorrowStr);

  const orderModal = (
    <OrderQuickCreateModal
      open={orderModalOpen}
      onClose={() => {
        setOrderModalOpen(false);
        setOrderPrefill(null);
      }}
      branches={branches}
      defaultBranchId={branchId}
      prefill={orderPrefill}
      onSuccess={() => {
        setSearchResults(null);
        loadOrders();
        setOrderModalOpen(false);
        setOrderPrefill(null);
      }}
    />
  );

  function mergeOrderEverywhere(updated) {
    setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
    setSearchResults((prev) => (prev == null ? null : prev.map((o) => (o.id === updated.id ? updated : o))));
    setSelected((s) => (s?.id === updated.id ? updated : s));
  }

  async function patchOrderStatus(orderId, status) {
    setStatusErr('');
    setStatusBusyId(orderId);
    try {
      const updated = await patchDeliveryOrderStatus(orderId, status);
      mergeOrderEverywhere(updated);
      loadDailyOps();
    } catch (e) {
      setStatusErr(e.message || String(e));
    } finally {
      setStatusBusyId(null);
    }
  }

  if (crmView === 'contentPipeline') {
    return (
      <div>
        <CrmTopNav active="contentPipeline" onNavigate={setCrmView} />
        <ContentPipelinePage />
      </div>
    );
  }

  if (crmView === 'launchDrill') {
    return (
      <div>
        <CrmTopNav active="launchDrill" onNavigate={setCrmView} />
        <LaunchDrillPage />
      </div>
    );
  }

  if (crmView === 'vkLeads') {
    return (
      <>
        {orderModal}
        <div>
          <CrmTopNav active="vkLeads" onNavigate={setCrmView} />
          <VkLeadsPage branchId={branchId} deliveryDate={date} />
        </div>
      </>
    );
  }

  if (crmView === 'b2b') {
    return (
      <>
        {orderModal}
        <div>
          <CrmTopNav active="b2b" onNavigate={setCrmView} />
          <B2BWorkspacePage branches={branches} defaultBranchId={branchId} />
        </div>
      </>
    );
  }

  if (crmView === 'kitchen') {
    return (
      <div>
        <CrmTopNav active="kitchen" onNavigate={setCrmView} />
        <KitchenLabPage />
      </div>
    );
  }

  if (crmView === 'menuDay') {
    return (
      <div>
        <CrmTopNav active="menuDay" onNavigate={setCrmView} />
        <MenuDayEditorPage />
      </div>
    );
  }

  if (crmView === 'dayEconomics') {
    return (
      <div>
        <CrmTopNav active="dayEconomics" onNavigate={setCrmView} />
        <DayEconomicsPage />
      </div>
    );
  }

  if (crmView === 'dayProduction') {
    return (
      <div>
        <CrmTopNav active="dayProduction" onNavigate={setCrmView} />
        <DayProductionRequirementsPage />
      </div>
    );
  }

  if (crmView === 'stockDesk') {
    return (
      <div>
        <CrmTopNav active="stockDesk" onNavigate={setCrmView} />
        <StockDeskPage />
      </div>
    );
  }

  if (crmView === 'inventoryCount') {
    return (
      <div>
        <CrmTopNav active="inventoryCount" onNavigate={setCrmView} />
        <InventoryCountPage />
      </div>
    );
  }

  if (crmView === 'productionStockGap') {
    return (
      <div>
        <CrmTopNav active="productionStockGap" onNavigate={setCrmView} />
        <ProductionStockGapPage />
      </div>
    );
  }

  if (crmView === 'productionWriteoff') {
    return (
      <div>
        <CrmTopNav active="productionWriteoff" onNavigate={setCrmView} />
        <ProductionWriteoffPage />
      </div>
    );
  }

  if (crmView === 'purchaseNeedSnapshot') {
    return (
      <div>
        <CrmTopNav active="purchaseNeedSnapshot" onNavigate={setCrmView} />
        <PurchaseNeedSnapshotPage />
      </div>
    );
  }

  if (crmView === 'suppliers') {
    return (
      <div>
        <CrmTopNav active="suppliers" onNavigate={setCrmView} />
        <SuppliersPage />
      </div>
    );
  }

  if (crmView === 'purchaseDrafts') {
    return (
      <div>
        <CrmTopNav active="purchaseDrafts" onNavigate={setCrmView} />
        <PurchaseDraftsPage />
      </div>
    );
  }

  if (crmView === 'procurementBoard') {
    return (
      <div>
        <CrmTopNav active="procurementBoard" onNavigate={setCrmView} />
        <ProcurementBoardPage />
      </div>
    );
  }

  return (
    <>
      {orderModal}
      <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 960, margin: '0 auto', padding: '16px 14px 32px' }}>
      <nav
        style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 20, flexWrap: 'wrap' }}
        aria-label="Разделы CRM"
      >
        <button type="button" disabled style={{ padding: '6px 12px', fontWeight: 600 }}>
          {nav.ordersKpi}
        </button>
        <button type="button" onClick={() => setCrmView('contentPipeline')} style={{ padding: '6px 12px', cursor: 'pointer' }}>
          {nav.content}
        </button>
        <button type="button" onClick={() => setCrmView('launchDrill')} style={{ padding: '6px 12px', cursor: 'pointer' }}>
          {nav.launchDrill}
        </button>
        <button type="button" onClick={() => setCrmView('vkLeads')} style={{ padding: '6px 12px', cursor: 'pointer' }}>
          {nav.vkLeads}
        </button>
        <button type="button" onClick={() => setCrmView('b2b')} style={{ padding: '6px 12px', cursor: 'pointer' }}>
          {nav.b2b}
        </button>
        <button type="button" onClick={() => setCrmView('kitchen')} style={{ padding: '6px 12px', cursor: 'pointer' }}>
          {nav.kitchen}
        </button>
        <button type="button" onClick={() => setCrmView('menuDay')} style={{ padding: '6px 12px', cursor: 'pointer' }}>
          {nav.menuDay}
        </button>
        <button type="button" onClick={() => setCrmView('dayEconomics')} style={{ padding: '6px 12px', cursor: 'pointer' }}>
          {nav.dayEconomics}
        </button>
        <button type="button" onClick={() => setCrmView('dayProduction')} style={{ padding: '6px 12px', cursor: 'pointer' }}>
          {nav.dayProduction}
        </button>
        <button type="button" onClick={() => setCrmView('stockDesk')} style={{ padding: '6px 12px', cursor: 'pointer' }}>
          {nav.stockDesk}
        </button>
        <button type="button" onClick={() => setCrmView('inventoryCount')} style={{ padding: '6px 12px', cursor: 'pointer' }}>
          {nav.inventoryCount}
        </button>
        <button type="button" onClick={() => setCrmView('productionStockGap')} style={{ padding: '6px 12px', cursor: 'pointer' }}>
          {nav.productionStockGap}
        </button>
        <button type="button" onClick={() => setCrmView('purchaseNeedSnapshot')} style={{ padding: '6px 12px', cursor: 'pointer' }}>
          {nav.purchaseNeedSnapshot}
        </button>
        <button type="button" onClick={() => setCrmView('purchaseDrafts')} style={{ padding: '6px 12px', cursor: 'pointer' }}>
          {nav.purchaseDrafts}
        </button>
        <button type="button" onClick={() => setCrmView('procurementBoard')} style={{ padding: '6px 12px', cursor: 'pointer' }}>
          {nav.procurementBoard}
        </button>
        <button type="button" onClick={() => setCrmView('suppliers')} style={{ padding: '6px 12px', cursor: 'pointer' }}>
          {nav.suppliers}
        </button>
        <button type="button" onClick={() => setCrmView('productionWriteoff')} style={{ padding: '6px 12px', cursor: 'pointer' }}>
          {nav.productionWriteoff}
        </button>
      </nav>
      <h1 style={{ marginTop: 0 }}>{title}</h1>
      <p style={{ color: '#555', marginTop: 0 }}>
        Заголовок <code>X-CRM-Token</code> → <code>VITE_CRM_TOKEN</code>
      </p>

      <DailyOpsPanel
        primary={dailyOps?.primary}
        compare={dailyOps?.compare}
        deltas={dailyOps?.deltas}
        compareDateLabel={dailyOps?.compare?.deliveryDate || null}
        loading={dailyOpsLoading}
        err={dailyOpsErr}
      />

      <OperatorDeliveryWorkspace
        branches={branches}
        branchId={branchId}
        onBranchChange={setBranchId}
        date={date}
        onDateChange={setDate}
        todayIso={todayStr}
        tomorrowIso={tomorrowStr}
        orders={orders}
        searchResults={searchResults}
        onSearchResults={setSearchResults}
        selected={selected}
        onSelect={setSelected}
        onPatchStatus={patchOrderStatus}
        statusBusyId={statusBusyId}
        searchErr={searchErr}
        onSearchErr={setSearchErr}
        onOpenCreate={() => {
          setOrderPrefill(null);
          setOrderModalOpen(true);
        }}
        onReload={() => loadOrders()}
        loading={loading}
        listErr={err}
        searchScoped={searchScoped}
        onSearchScopedChange={setSearchScoped}
      />

      {statusErr ? (
        <div style={{ color: '#c62828', margin: '12px 0', fontSize: 14 }} role="alert">
          {statusErr}
        </div>
      ) : null}

      {import.meta.env.DEV && !loading && orders.length === 0 && !err && !searchResults ? (
        <p style={{ fontSize: 12, color: '#888', marginBottom: 16 }}>
          Dev: нет заказов на дату — проверьте VITE_API_BASE и VITE_CRM_TOKEN.
        </p>
      ) : null}

      {/* KPI свёрнут по умолчанию — оператор сначала видит заказы */}
      <details style={{ marginBottom: 28, border: '1px solid #e0e0e0', borderRadius: 12, padding: '8px 14px' }}>
        <summary style={{ fontSize: '1.05rem', fontWeight: 700, cursor: 'pointer', padding: '8px 0' }}>
          KPI и сводки запуска
        </summary>
        <div style={{ paddingTop: 8 }}>
      <section style={{ marginBottom: 16 }} aria-labelledby="launch-kpi-heading">
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <h2 id="launch-kpi-heading" style={{ margin: 0, fontSize: '1.25rem' }}>
            Запуск · KPI
          </h2>
          <label style={{ fontSize: 14 }}>
            Период (дней, по дате оформления)
            <select
              value={kpiDays}
              onChange={(e) => setKpiDays(Number(e.target.value))}
              style={{ display: 'block', marginTop: 4, padding: 6 }}
            >
              {[1, 3, 7, 14, 30, 90].map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          {kpiLoading ? <span style={{ color: '#666', fontSize: 14 }}>Обновление KPI…</span> : null}
        </div>

        {kpiErr ? (
          <div style={{ color: '#b00020', marginBottom: 12 }} role="alert">
            {kpiErr}
          </div>
        ) : null}

        {kpi ? (
          <>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
                gap: 12,
                marginBottom: 16
              }}
            >
              <div style={cardStyle()}>
                <div style={{ fontSize: 12, color: '#666', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Заказы</div>
                <div style={{ fontSize: 26, fontWeight: 700, marginTop: 4 }}>{kpi.totals.orderCount}</div>
                <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>за выбранный период</div>
              </div>
              <div style={cardStyle()}>
                <div style={{ fontSize: 12, color: '#666', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Выручка</div>
                <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>{rubKopeks(kpi.totals.revenueKopeks)}</div>
                <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>сумма по полю totalAmount</div>
              </div>
              <div style={cardStyle()}>
                <div style={{ fontSize: 12, color: '#666', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Средний чек</div>
                <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>{rubKopeks(kpi.totals.aovKopeks)}</div>
                <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>выручка / заказы</div>
              </div>
            </div>

            {kpi.byDeliveryDate?.length > 0 ? (
              <div style={{ ...cardStyle(), marginBottom: 16 }}>
                <strong>По датам доставки (в выбранном периоде оформления)</strong>
                <ul style={{ fontSize: 14, margin: '8px 0 0', paddingLeft: 18 }}>
                  {kpi.byDeliveryDate.slice(0, 14).map((r) => (
                    <li key={r.deliveryDate}>
                      {r.deliveryDate}: {r.orderCount} заказ. · {rubKopeks(r.revenueKopeks)}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12, marginBottom: 16 }}>
              <div style={cardStyle()}>
                <strong style={{ fontSize: 14 }}>Доставка сегодня ({todayStr})</strong>
                <p style={{ margin: '8px 0 0', fontSize: 15 }}>
                  {delivToday ? (
                    <>
                      {delivToday.orderCount} заказ. · {rubKopeks(delivToday.revenueKopeks)}
                    </>
                  ) : (
                    <span style={{ color: '#888' }}>Нет заказов в окне (по дате доставки)</span>
                  )}
                </p>
              </div>
              <div style={cardStyle()}>
                <strong style={{ fontSize: 14 }}>Доставка завтра ({tomorrowStr})</strong>
                <p style={{ margin: '8px 0 0', fontSize: 15 }}>
                  {delivTomorrow ? (
                    <>
                      {delivTomorrow.orderCount} заказ. · {rubKopeks(delivTomorrow.revenueKopeks)}
                    </>
                  ) : (
                    <span style={{ color: '#888' }}>Нет заказов в окне</span>
                  )}
                </p>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16, marginBottom: 16 }}>
              <div style={cardStyle()}>
                <strong>Топ источников (по числу заказов)</strong>
                <ol style={{ margin: '10px 0 0', paddingLeft: 18, fontSize: 14 }}>
                  {kpi.topSourcesByCount.length === 0 ? (
                    <li style={{ color: '#888' }}>Нет данных</li>
                  ) : (
                    kpi.topSourcesByCount.map((r) => (
                      <li key={r.source} style={{ marginBottom: 4 }}>
                        <code>{r.source}</code> — {r.orderCount} шт., {rubKopeks(r.revenueKopeks)}
                      </li>
                    ))
                  )}
                </ol>
              </div>
              <div style={cardStyle()}>
                <strong>Топ источников (по выручке)</strong>
                <ol style={{ margin: '10px 0 0', paddingLeft: 18, fontSize: 14 }}>
                  {kpi.topSourcesByRevenue.length === 0 ? (
                    <li style={{ color: '#888' }}>Нет данных</li>
                  ) : (
                    kpi.topSourcesByRevenue.map((r) => (
                      <li key={`${r.source}-rev`} style={{ marginBottom: 4 }}>
                        <code>{r.source}</code> — {rubKopeks(r.revenueKopeks)} ({r.orderCount} заказ.)
                      </li>
                    ))
                  )}
                </ol>
              </div>
            </div>

            <div style={cardStyle()}>
              <strong>Лента заказов (последние в периоде)</strong>
              <div style={{ overflowX: 'auto', marginTop: 10 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ textAlign: 'left', borderBottom: '1px solid #ddd' }}>
                      <th style={{ padding: '6px 8px' }}>Время</th>
                      <th style={{ padding: '6px 8px' }}>Клиент</th>
                      <th style={{ padding: '6px 8px' }}>Доставка</th>
                      <th style={{ padding: '6px 8px' }}>Сумма</th>
                      <th style={{ padding: '6px 8px' }}>Источник</th>
                    </tr>
                  </thead>
                  <tbody>
                    {kpi.recentOrders.length === 0 ? (
                      <tr>
                        <td colSpan={5} style={{ padding: 12, color: '#888' }}>
                          Нет заказов
                        </td>
                      </tr>
                    ) : (
                      kpi.recentOrders.map((o) => (
                        <tr key={o.id} style={{ borderBottom: '1px solid #eee' }}>
                          <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>
                            {new Date(o.createdAt).toLocaleString('ru-RU', {
                              day: '2-digit',
                              month: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </td>
                          <td style={{ padding: '6px 8px' }}>{o.customerName}</td>
                          <td style={{ padding: '6px 8px' }}>{o.deliveryDate}</td>
                          <td style={{ padding: '6px 8px' }}>{rubKopeks(o.totalAmount)}</td>
                          <td style={{ padding: '6px 8px' }}>
                            <code>{o.source}</code>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <p style={{ fontSize: 12, color: '#888', marginTop: 12 }}>
              Как считается источник: сначала <code>utm_source</code>, иначе путь и UTM, иначе служебные значения <code>unknown</code> /{' '}
              <code>direct</code> (логика <code>orderSourceKey</code> на сервере).
            </p>
          </>
        ) : null}
      </section>
        </div>
      </details>
    </div>
    </>
  );
}
