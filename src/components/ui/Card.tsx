import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';

export function Card({ className, ...rest }: HTMLAttributes<HTMLElement>) {
  return <section className={cn('rounded-lg border border-line bg-surface shadow-sm', className)} {...rest} />;
}

/** Card title row: title (with an optional count and subtitle) at the start, actions at the end. */
export function CardHeader({ title, subtitle, count, actions, className }: { title: ReactNode; subtitle?: ReactNode; count?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-center gap-3 border-b border-line px-4 py-3', className)}>
      <div className="min-w-0 flex-1">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold text-ink">
          {title}
          {count != null && <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs font-medium text-ink-muted tabular">{count}</span>}
        </h2>
        {subtitle && <p className="mt-0.5 text-[13px] text-ink-subtle">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
