'use client';

// A date field that always shows dd/mm/yyyy. A native <input type="date"> shows the browser's own
// locale (mm/dd/yyyy on an English Windows), so it stays invisible under the button and only
// supplies the calendar. Value in and out: yyyy-MM-dd ('' when empty).
import { useRef } from 'react';
import { CalendarDays } from 'lucide-react';
import { formatDmy } from '@/lib/dates';
import { cn } from './cn';

export function DateField({ value, onChange, label, className }: { value: string; onChange: (iso: string) => void; label?: string; className?: string }) {
  const picker = useRef<HTMLInputElement>(null);
  const open = () => {
    try {
      picker.current?.showPicker();
    } catch {
      picker.current?.focus();
    }
  };
  return (
    <span className={cn('relative inline-flex', className)}>
      <button
        type="button"
        onClick={open}
        aria-label={label}
        className="flex h-8 items-center gap-2 rounded border border-line bg-surface px-2.5 text-[13px] text-ink hover:border-line-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      >
        <CalendarDays className="size-4 text-ink-subtle" aria-hidden />
        <span className="tabular" dir="ltr">{formatDmy(value) || '--/--/----'}</span>
      </button>
      <input ref={picker} type="date" value={value} onChange={(e) => onChange(e.target.value)} tabIndex={-1} aria-hidden className="pointer-events-none absolute inset-0 opacity-0" />
    </span>
  );
}
