'use client';

// Side panel that slides in from the end side (left in Hebrew, right in English).
// Modal: Escape or the backdrop closes it, focus moves into it and back to where it was.
import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { IconButton } from './Button';
import { cn } from './cn';

export function Drawer({ open, onClose, title, subtitle, closeLabel, children, footer, width = 'w-[min(480px,100vw)]' }: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  closeLabel: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
}) {
  const panel = useRef<HTMLDivElement>(null);
  // The latest onClose, so the effect below runs only when the drawer opens or closes.
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    if (!open) return;
    const before = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close.current();
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      before?.focus?.();
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} aria-hidden />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className={cn('animate-fade-in absolute inset-y-0 end-0 flex flex-col border-s border-line bg-surface shadow-lg focus:outline-none', width)}
      >
        <header className="flex items-start gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-ink">{title}</h2>
            {subtitle && <div className="mt-0.5 text-[13px] text-ink-subtle">{subtitle}</div>}
          </div>
          <IconButton label={closeLabel} icon={<X />} onClick={onClose} size="sm" />
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <footer className="border-t border-line px-5 py-3">{footer}</footer>}
      </div>
    </div>
  );
}
