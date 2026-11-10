'use client';

// Date field that always shows dd/mm/yyyy. A native <input type="date"> shows the browser's own
// locale format (e.g. mm/dd/yyyy on an English Windows), so it stays hidden over the button and
// only provides the calendar picker. Value in/out is yyyy-MM-dd.
import { useRef, type CSSProperties } from 'react';

export const formatDmy = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split('-').reverse().join('/') : '');

export default function DateInput({
  value,
  onChange,
  style,
  ariaLabel,
}: {
  value: string;
  onChange: (iso: string) => void;
  style?: CSSProperties;
  ariaLabel?: string;
}) {
  const ref = useRef<HTMLInputElement | null>(null);
  const open = () => {
    const el = ref.current;
    if (!el) return;
    try {
      el.showPicker();
    } catch {
      el.focus();
      el.click();
    }
  };
  return (
    <span style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        onClick={open}
        aria-label={ariaLabel}
        style={{ cursor: 'pointer', minWidth: 130, textAlign: 'center', fontVariantNumeric: 'tabular-nums', direction: 'ltr', ...style }}
      >
        {formatDmy(value) || '--/--/----'} 📅
      </button>
      <input
        ref={ref}
        type="date"
        value={value}
        onChange={(e) => e.target.value && onChange(e.target.value)}
        tabIndex={-1}
        aria-hidden="true"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, pointerEvents: 'none', border: 0, padding: 0 }}
      />
    </span>
  );
}
