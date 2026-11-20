import type { ReactNode } from 'react';
import { cn } from './cn';
import { Meter } from './Meter';
import type { Tone } from './Badge';

const VALUE_TONE: Partial<Record<Tone, string>> = { success: 'text-success', warning: 'text-warning', danger: 'text-danger', info: 'text-info' };

/** A key figure: label, large value, optional percentage bar and hint line. */
export function Stat({ label, value, hint, icon, tone, meter, className }: { label: string; value: ReactNode; hint?: ReactNode; icon?: ReactNode; tone?: Tone; meter?: number; className?: string }) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5 rounded-lg border border-line bg-surface p-4 shadow-sm', className)}>
      <div className="flex items-center gap-2 text-[13px] font-medium text-ink-muted">
        {icon && <span className="text-ink-subtle [&>svg]:size-4">{icon}</span>}
        <span className="truncate" title={label}>{label}</span>
      </div>
      <div className={cn('text-[26px] font-semibold leading-none tracking-tight tabular', tone ? VALUE_TONE[tone] : 'text-ink')}>{value}</div>
      {meter != null && <Meter value={meter} label={label} className="mt-1" />}
      {hint && <div className="truncate text-xs text-ink-subtle">{hint}</div>}
    </div>
  );
}
