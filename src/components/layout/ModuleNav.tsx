'use client';

import type { ReactNode } from 'react';
import { Activity, CalendarRange, Flame, LayoutGrid, MapPin, MapPinned } from 'lucide-react';
import { useT } from '@/i18n/useT';
import type { MessageKey } from '@/i18n/messages';
import { cn } from '@/components/ui/cn';

export type ViewId = 'plan' | 'actual' | 'map' | 'heat' | 'tools' | 'addresses';

export const VIEWS: { id: ViewId; label: MessageKey; icon: ReactNode }[] = [
  { id: 'plan', label: 'nav.plan', icon: <CalendarRange /> },
  { id: 'actual', label: 'nav.actual', icon: <Activity /> },
  { id: 'map', label: 'nav.map', icon: <MapPinned /> },
  { id: 'heat', label: 'nav.heat', icon: <Flame /> },
  { id: 'tools', label: 'nav.tools', icon: <LayoutGrid /> },
  { id: 'addresses', label: 'nav.addresses', icon: <MapPin /> },
];

/** The screens of the dashboard, with the working date at the end of the bar. */
export function ModuleNav({ view, onChange, end }: { view: ViewId; onChange: (v: ViewId) => void; end?: ReactNode }) {
  const { t } = useT();
  return (
    <div className="sticky top-14 z-30 border-b border-line bg-surface">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 sm:px-6">
        <nav aria-label="ROADNET" className="-mb-px flex min-w-0 flex-1 overflow-x-auto">
          {VIEWS.map((v) => {
            const active = v.id === view;
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => onChange(v.id)}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex h-12 shrink-0 items-center gap-2 border-b-2 px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus [&>svg]:size-4',
                  active ? 'border-accent text-ink' : 'border-transparent text-ink-muted hover:border-line-strong hover:text-ink'
                )}
              >
                {v.icon}
                {t(v.label)}
              </button>
            );
          })}
        </nav>
        {end && <div className="py-2">{end}</div>}
      </div>
    </div>
  );
}
