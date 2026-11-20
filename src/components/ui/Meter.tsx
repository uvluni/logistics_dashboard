import { cn } from './cn';
import type { Tone } from './Badge';

/** Utilization tone: over 100% is a problem, 85-100% is tight, under 50% is unused capacity. */
export function utilizationTone(pct: number): Tone {
  if (pct > 100) return 'danger';
  if (pct >= 85) return 'warning';
  if (pct < 50) return 'info';
  return 'success';
}

const FILL: Record<Tone, string> = {
  neutral: 'bg-ink-subtle',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  info: 'bg-info',
};
const TEXT: Record<Tone, string> = {
  neutral: 'text-ink-muted',
  success: 'text-ink',
  warning: 'text-warning',
  danger: 'text-danger',
  info: 'text-info',
};

/** A thin percentage bar. `label` names it for screen readers. */
export function Meter({ value, tone, label, className }: { value: number; tone?: Tone; label: string; className?: string }) {
  const t = tone ?? utilizationTone(value);
  return (
    <div role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value)} className={cn('h-1.5 w-full overflow-hidden rounded-full bg-surface-muted', className)}>
      <div className={cn('h-full rounded-full transition-[width] duration-500', FILL[t])} style={{ width: `${Math.max(0, Math.min(value, 100))}%` }} />
    </div>
  );
}

/** Percentage with its bar, for table cells. */
export function MeterCell({ value, label }: { value: number; label: string }) {
  const tone = utilizationTone(value);
  return (
    <div className="flex min-w-[96px] items-center gap-2">
      <Meter value={value} tone={tone} label={label} className="flex-1" />
      <span className={cn('w-10 text-end text-[13px] font-medium tabular', TEXT[tone])}>{Math.round(value)}%</span>
    </div>
  );
}
