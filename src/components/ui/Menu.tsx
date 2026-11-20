'use client';

// Dropdown menu: a trigger button and a list of actions or choices. Closes on outside click,
// Escape, or after a choice; arrow keys move between items; focus returns to the trigger.
import { useEffect, useId, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { Check } from 'lucide-react';
import { cn } from './cn';

export interface MenuItem {
  key: string;
  label: ReactNode;
  icon?: ReactNode;
  hint?: ReactNode;
  /** Shown with a check mark (for choices such as language or theme). */
  checked?: boolean;
  disabled?: boolean;
  onSelect: () => void;
}
export interface MenuSection {
  title?: string;
  items: MenuItem[];
}

export function Menu({ trigger, sections, align = 'end', width = 'w-56' }: {
  /** Receives the props to spread on the trigger button. */
  trigger: (props: { onClick: () => void; 'aria-haspopup': 'menu'; 'aria-expanded': boolean; 'aria-controls': string }) => ReactElement;
  sections: MenuSection[];
  align?: 'start' | 'end';
  width?: string;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    // Focus the first item for keyboard users.
    list.current?.querySelector<HTMLButtonElement>('[role^="menuitem"]:not([disabled])')?.focus();
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const close = () => {
    setOpen(false);
    root.current?.querySelector<HTMLButtonElement>('[aria-haspopup="menu"]')?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const items = [...(list.current?.querySelectorAll<HTMLButtonElement>('[role^="menuitem"]:not([disabled])') ?? [])];
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
  };

  return (
    <div ref={root} className="relative" onKeyDown={onKeyDown}>
      {trigger({ onClick: () => setOpen((o) => !o), 'aria-haspopup': 'menu', 'aria-expanded': open, 'aria-controls': id })}
      {open && (
        <div
          ref={list}
          id={id}
          role="menu"
          className={cn(
            'animate-fade-in absolute top-full z-50 mt-1.5 overflow-hidden rounded-lg border border-line bg-surface py-1 text-ink shadow-lg',
            align === 'end' ? 'end-0' : 'start-0',
            width
          )}
        >
          {sections.map((s, si) => (
            <div key={si} role="group" aria-label={s.title} className={cn(si > 0 && 'mt-1 border-t border-line pt-1')}>
              {s.title && <div className="px-3 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">{s.title}</div>}
              {s.items.map((it) => (
                <button
                  key={it.key}
                  type="button"
                  role={it.checked == null ? 'menuitem' : 'menuitemradio'}
                  aria-checked={it.checked == null ? undefined : it.checked}
                  disabled={it.disabled}
                  onClick={() => {
                    it.onSelect();
                    close();
                  }}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-start text-sm hover:bg-surface-hover focus:bg-surface-hover focus:outline-none disabled:opacity-40 [&>svg]:size-4"
                >
                  {it.icon && <span className="text-ink-subtle [&>svg]:size-4">{it.icon}</span>}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{it.label}</span>
                    {it.hint && <span className="block text-xs text-ink-subtle">{it.hint}</span>}
                  </span>
                  {it.checked && <Check className="text-accent" aria-hidden />}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
