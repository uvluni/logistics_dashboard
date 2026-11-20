import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import { cn } from './cn';

type AlertTone = 'info' | 'success' | 'warning' | 'danger';
const ALERT_STYLE: Record<AlertTone, string> = {
  info: 'bg-info-soft text-info',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
};
const ALERT_ICON: Record<AlertTone, ReactNode> = {
  info: <Info aria-hidden />,
  success: <CheckCircle2 aria-hidden />,
  warning: <AlertTriangle aria-hidden />,
  danger: <XCircle aria-hidden />,
};

/** A one-line message with an optional action button. */
export function Alert({ tone = 'info', children, action, className }: { tone?: AlertTone; children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={cn('flex items-center gap-3 rounded px-4 py-3 text-sm', ALERT_STYLE[tone], className)}>
      <span className="shrink-0 [&>svg]:size-4">{ALERT_ICON[tone]}</span>
      <div className="min-w-0 flex-1 text-ink">{children}</div>
      {action}
    </div>
  );
}

/** Centered message for a screen or card with nothing to show. */
export function EmptyState({ icon, title, hint, action }: { icon?: ReactNode; title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
      {icon && <div className="mb-1 flex size-12 items-center justify-center rounded-full bg-surface-muted text-ink-subtle [&>svg]:size-6">{icon}</div>}
      <p className="text-[15px] font-semibold text-ink">{title}</p>
      {hint && <p className="max-w-sm text-sm text-ink-subtle">{hint}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

/**
 * A grey placeholder block shown while data loads. It appears only after 300 ms (fast loads show
 * no placeholder at all) and then breathes slowly instead of blinking (see .skeleton in globals.css).
 */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('skeleton rounded bg-surface-muted', className)} />;
}
