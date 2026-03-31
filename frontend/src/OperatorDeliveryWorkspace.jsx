import { useEffect, useMemo, useState } from 'react';
import { fetchDeliveryOrdersSearch } from './api.js';
import { OperatorOrderCard } from './OperatorOrderCard.jsx';

const segBtn = {
  flex: '1 1 auto',
  minHeight: 48,
  padding: '12px 14px',
  fontSize: 15,
  fontWeight: 700,
  border: '1px solid #bbb',
  background: '#fff',
  borderRadius: 10,
  cursor: 'pointer'
};

const segActive = {
  ...segBtn,
  background: '#1565c0',
  color: '#fff',
  borderColor: '#1565c0'
};

/**
 * Операторская зона: дата, поиск, список карточек заказов.
 */
export function OperatorDeliveryWorkspace({
  branches,
  branchId,
  onBranchChange,
  date,
  onDateChange,
  todayIso,
  tomorrowIso,
  orders,
  searchResults,
  onSearchResults,
  selected,
  onSelect,
  onPatchStatus,
  statusBusyId,
  searchErr,
  onSearchErr,
  onOpenCreate,
  onReload,
  loading,
  listErr,
  searchScoped,
  onSearchScopedChange
}) {
  const [q, setQ] = useState('');
  const [searching, setSearching] = useState(false);
  /** @type {'all' | 'vk' | 'vk_new'} */
  const [vkOrderScope, setVkOrderScope] = useState('all');

  useEffect(() => {
    setQ('');
    onSearchResults(null);
    onSearchErr('');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- сброс поиска при смене точки
  }, [branchId]);

  useEffect(() => {
    const t = q.trim();
    if (t.length < 2) {
      onSearchResults(null);
      onSearchErr('');
      setSearching(false);
      return;
    }
    let cancelled = false;
    const h = setTimeout(() => {
      setSearching(true);
      fetchDeliveryOrdersSearch({
        branchId,
        q: t,
        ...(searchScoped ? { date } : {}),
        limit: 40
      })
        .then((data) => {
          if (!cancelled) {
            onSearchResults(Array.isArray(data) ? data : []);
            onSearchErr('');
          }
        })
        .catch((e) => {
          if (!cancelled) onSearchErr(e.message || String(e));
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 320);
    return () => {
      cancelled = true;
      clearTimeout(h);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- колбэки setState стабильны у родителя
  }, [q, branchId, date, searchScoped]);

  const displayOrders = searchResults !== null ? searchResults : orders;
  const isSearchMode = searchResults !== null;

  const ordersForCards = useMemo(() => {
    if (vkOrderScope === 'all') return displayOrders;
    if (vkOrderScope === 'vk') return displayOrders.filter((o) => o.sourceChannel === 'VK');
    return displayOrders.filter((o) => o.sourceChannel === 'VK' && (o.status || 'NEW') === 'NEW');
  }, [displayOrders, vkOrderScope]);

  return (
    <section aria-labelledby="operator-orders-heading">
      <h2 id="operator-orders-heading" style={{ fontSize: '1.25rem', margin: '0 0 12px' }}>
        Оператор · заказы на доставку
      </h2>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          alignItems: 'center',
          marginBottom: 12,
          fontSize: 13
        }}
        role="group"
        aria-label="Фильтр по каналу VK"
      >
        <span style={{ fontWeight: 600, color: '#555' }}>VK:</span>
        {[
          { id: 'all', label: 'Все заказы' },
          { id: 'vk', label: 'Только VK' },
          { id: 'vk_new', label: 'VK · новые' }
        ].map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => setVkOrderScope(id)}
            style={{
              padding: '8px 12px',
              borderRadius: 999,
              border: `1px solid ${vkOrderScope === id ? '#4527a0' : '#ccc'}`,
              background: vkOrderScope === id ? '#ede7f6' : '#fff',
              fontWeight: vkOrderScope === id ? 700 : 500,
              cursor: 'pointer'
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 5,
          background: 'linear-gradient(#fff 90%, transparent)',
          paddingBottom: 8,
          marginBottom: 8
        }}
      >
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <button
            type="button"
            style={date === todayIso ? segActive : segBtn}
            onClick={() => onDateChange(todayIso)}
          >
            Сегодня
          </button>
          <button
            type="button"
            style={date === tomorrowIso ? segActive : segBtn}
            onClick={() => onDateChange(tomorrowIso)}
          >
            Завтра
          </button>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end', marginBottom: 10 }}>
          <label style={{ flex: '1 1 200px', minWidth: 0 }}>
            <span style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Точка</span>
            <select
              value={branchId}
              onChange={(e) => onBranchChange(e.target.value)}
              style={{ width: '100%', minHeight: 48, padding: '10px 12px', fontSize: 16, borderRadius: 10 }}
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          <label style={{ flex: '0 1 auto' }}>
            <span style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Дата</span>
            <input
              type="date"
              value={date}
              onChange={(e) => onDateChange(e.target.value)}
              style={{ minHeight: 48, padding: '10px 12px', fontSize: 16, borderRadius: 10 }}
            />
          </label>
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, fontSize: 14 }}>
          <input
            type="checkbox"
            checked={searchScoped}
            onChange={(e) => onSearchScopedChange(e.target.checked)}
            style={{ width: 22, height: 22 }}
          />
          Искать только в выбранной дате доставки
        </label>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
          <input
            type="search"
            enterKeyHint="search"
            placeholder="Поиск: телефон, имя, адрес, ID…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{
              flex: '1 1 220px',
              minWidth: 0,
              minHeight: 48,
              padding: '12px 14px',
              fontSize: 17,
              borderRadius: 10,
              border: '1px solid #999'
            }}
          />
          <button
            type="button"
            onClick={onOpenCreate}
            disabled={!branchId}
            style={{
              minHeight: 48,
              padding: '12px 18px',
              fontSize: 16,
              fontWeight: 700,
              background: '#2e7d32',
              color: '#fff',
              border: 'none',
              borderRadius: 10,
              cursor: branchId ? 'pointer' : 'not-allowed',
              opacity: branchId ? 1 : 0.5
            }}
          >
            + Заказ
          </button>
          <button
            type="button"
            onClick={() => onReload()}
            disabled={loading || !branchId}
            style={{ ...segBtn, minHeight: 48 }}
          >
            {loading ? '…' : 'Обновить'}
          </button>
        </div>

        {q.trim().length > 0 && q.trim().length < 2 ? (
          <p style={{ margin: 0, fontSize: 13, color: '#666' }}>Введите минимум 2 символа для поиска.</p>
        ) : null}
        {searching ? <p style={{ margin: '4px 0 0', fontSize: 13, color: '#666' }}>Поиск…</p> : null}
        {isSearchMode ? (
          <p style={{ margin: '6px 0 0', fontSize: 13, color: '#1565c0' }}>
            Найдено: {displayOrders.length}
            {vkOrderScope !== 'all' ? ` · с фильтром VK: ${ordersForCards.length}` : ''}
            <button
              type="button"
              onClick={() => {
                setQ('');
                onSearchResults(null);
              }}
              style={{ marginLeft: 12, fontSize: 13, textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              Сбросить поиск
            </button>
          </p>
        ) : null}
      </div>

      {listErr || searchErr ? (
        <div style={{ color: '#b00020', marginBottom: 12 }} role="alert">
          {listErr || searchErr}
        </div>
      ) : null}

      <div style={{ marginTop: 8 }}>
        {ordersForCards.length === 0 && !loading ? (
          <p style={{ color: '#666', fontSize: 15 }}>
            {isSearchMode
              ? vkOrderScope !== 'all'
                ? 'Нет заказов под выбранный фильтр VK.'
                : 'Ничего не найдено.'
              : vkOrderScope !== 'all'
                ? 'Нет заказов VK на эту дату по фильтру.'
                : 'Нет заказов на эту дату.'}
          </p>
        ) : (
          ordersForCards.map((o) => (
            <OperatorOrderCard
              key={o.id}
              order={o}
              selected={selected?.id === o.id}
              onSelect={() => onSelect(o)}
              statusUpdating={statusBusyId === o.id}
              onPatchStatus={(st) => onPatchStatus(o.id, st)}
            />
          ))
        )}
      </div>
    </section>
  );
}
