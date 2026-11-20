'use client';

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from './cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

const VARIANT: Record<Variant, string> = {
  primary: 'bg-primary text-primary-fg hover:bg-primary-hover border border-transparent shadow-sm',
  secondary: 'bg-surface text-ink border border-line hover:bg-surface-hover hover:border-line-strong shadow-sm',
  ghost: 'bg-transparent text-ink-muted border border-transparent hover:bg-surface-hover hover:text-ink',
  danger: 'bg-danger text-white border border-transparent hover:opacity-90',
};
const SIZE: Record<Size, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5',
  md: 'h-9 px-4 text-sm gap-2',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon, loading, className, children, disabled, type = 'button', ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cn(
        'inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:pointer-events-none disabled:opacity-50',
        '[&>svg]:size-4',
        VARIANT[variant],
        SIZE[size],
        className
      )}
      {...rest}
    >
      {loading ? <Loader2 className="animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
});

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Accessible name and tooltip. */
  label: string;
  icon: ReactNode;
  variant?: 'ghost' | 'secondary' | 'topbar';
  size?: Size;
  active?: boolean;
}

/** A square button with only an icon. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, icon, variant = 'ghost', size = 'md', active, className, type = 'button', ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded transition-colors [&>svg]:size-[18px]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-40',
        size === 'sm' ? 'size-8' : 'size-9',
        variant === 'ghost' && 'text-ink-muted hover:bg-surface-hover hover:text-ink',
        variant === 'secondary' && 'border border-line bg-surface text-ink-muted shadow-sm hover:bg-surface-hover hover:text-ink',
        variant === 'topbar' && 'text-topbar-muted hover:bg-topbar-hover hover:text-topbar-fg',
        active && (variant === 'topbar' ? 'bg-topbar-hover text-topbar-fg' : 'bg-surface-selected text-ink'),
        className
      )}
      {...rest}
    >
      {icon}
    </button>
  );
});
