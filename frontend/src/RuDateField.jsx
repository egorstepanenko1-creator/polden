import { useState } from 'react';

/**
 * Поле ввода даты в формате дд.мм.гггг → ISO yyyy-mm-dd.
 */
export function RuDateField({ label, value, onChange, variant }) {
  const toDisplay = (iso) => {
    if (!iso) return '';
    const [y, m, d] = String(iso).split('-');
    return `${d || ''}.${m || ''}.${y || ''}`;
  };

  const toIso = (display) => {
    const parts = String(display).split('.');
    if (parts.length !== 3) return display;
    const [d, m, y] = parts;
    if (y && y.length === 4) return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    return display;
  };

  const [raw, setRaw] = useState(toDisplay(value));

  const handleChange = (e) => {
    let v = e.target.value.replace(/[^\d.]/g, '');
    // Автоподстановка точек
    const digits = v.replace(/\./g, '');
    if (digits.length >= 2 && !v.includes('.')) v = digits.slice(0, 2) + '.' + digits.slice(2);
    if (digits.length >= 4 && v.split('.').length < 3) {
      const p = v.split('.');
      v = p[0] + '.' + (p[1] || '').slice(0, 2) + '.' + (p[1] || '').slice(2);
    }
    setRaw(v.slice(0, 10));
    const iso = toIso(v);
    if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) onChange(iso);
  };

  const compact = variant === 'compact';
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      {label && <label style={{ fontSize: compact ? 13 : 14 }}>{label}</label>}
      <input
        type="text"
        inputMode="numeric"
        placeholder="дд.мм.гггг"
        value={raw}
        onChange={handleChange}
        style={{
          padding: compact ? '4px 8px' : '6px 10px',
          border: '1px solid #ccc',
          borderRadius: 6,
          fontSize: compact ? 13 : 14,
          width: 120
        }}
      />
    </div>
  );
}
