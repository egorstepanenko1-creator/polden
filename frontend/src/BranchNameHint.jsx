/**
 * Подсказка с названием текущей точки и кнопка обновления списка.
 */
export function BranchNameHint({ branches, onBranchesReload }) {
  if (!branches || branches.length <= 1) return null;
  return (
    <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
      {branches.length} точек доставки{' '}
      {onBranchesReload && (
        <button
          type="button"
          onClick={onBranchesReload}
          style={{
            background: 'none',
            border: 'none',
            color: '#2e7d4f',
            cursor: 'pointer',
            fontSize: 12,
            textDecoration: 'underline',
            padding: 0
          }}
        >
          обновить
        </button>
      )}
    </div>
  );
}
