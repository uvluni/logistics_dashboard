'use client';

// The working date for every screen: previous / next day, a calendar, and Today / Tomorrow.
import { useRef } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { useT } from '@/i18n/useT';
import { addDays, formatDmy, nextWorkDay, todayIso } from '@/lib/dates';
import { IconButton } from '@/components/ui/Button';
import { cn } from '@/components/ui/cn';

export function DateNavigator({ value, onChange }: { value: string; onChange: (iso: string) => void }) {
  const { t, isRTL, locale } = useT();
  const picker = useRef<HTMLInputElement>(null);
  const today = todayIso();
  const tomorrow = nextWorkDay(today);
  const weekday = value ? new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(Date.parse(value + 'T00:00:00Z')) : '';

  const openPicker = () => {
    const el = picker.current;
    if (!el) return;
    try {
      el.showPicker();
    } catch {
      el.focus();
    }
  };

  // In a right-to-left page "previous" points right.
  const Prev = isRTL ? ChevronRight : ChevronLeft;
  const Next = isRTL ? ChevronLeft : ChevronRight;

  const quick = (label: string, iso: string) => (
    <button
      type="button"
      onClick={() => onChange(iso)}
      aria-pressed={value === iso}
      className={cn(
        'h-8 rounded px-3 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
        value === iso ? 'bg-surface-selected text-ink' : 'text-ink-muted hover:bg-surface-hover hover:text-ink'
      )}
    >
      {label}
    </button>
  );

  return (
    <div className="flex items-center gap-1" role="group" aria-label={t('date.label')}>
      <IconButton size="sm" label={t('date.prev')} icon={<Prev />} onClick={() => onChange(addDays(value, -1))} />
      <div className="relative">
        <button
          type="button"
          onClick={openPicker}
          className="flex h-8 items-center gap-2 rounded border border-line bg-surface px-3 text-[13px] font-medium text-ink shadow-sm hover:border-line-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          <CalendarDays className="size-4 text-ink-subtle" aria-hidden />
          <span className="text-ink-muted">{weekday}</span>
          <span className="tabular" dir="ltr">{formatDmy(value)}</span>
        </button>
        {/* The native picker supplies the calendar; the button shows dd/mm/yyyy in every locale. */}
        <input
          ref={picker}
          type="date"
          value={value}
          onChange={(e) => e.target.value && onChange(e.target.value)}
          tabIndex={-1}
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-0"
        />
      </div>
      <IconButton size="sm" label={t('date.next')} icon={<Next />} onClick={() => onChange(addDays(value, 1))} />
      <div className="ms-1 hidden items-center gap-0.5 sm:flex">
        {quick(t('date.today'), today)}
        {quick(t('date.tomorrow'), tomorrow)}
      </div>
    </div>
  );
}
