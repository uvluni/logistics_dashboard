'use client';

import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronsUpDown, Search } from 'lucide-react';
import type { RouteKPI } from '@/types';
import { useT } from '@/i18n/useT';
import type { MessageKey } from '@/i18n/messages';
import { hoursMinutes } from '@/lib/dates';
import { Card, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { MeterCell } from '@/components/ui/Meter';
import { cn } from '@/components/ui/cn';
import { routeStatus } from './routeStatus';

type SortKey = 'status' | 'routeId' | 'driverName' | 'vehicleType' | 'stopCount' | 'totalWeight' | 'weightUtilization' | 'totalDurationMinutes' | 'timeUtilization';
interface Column { key: SortKey; label: MessageKey; numeric?: boolean; className?: string }

const COLUMNS: Column[] = [
  { key: 'routeId', label: 'table.route' },
  { key: 'driverName', label: 'table.driver' },
  { key: 'vehicleType', label: 'table.vehicle', className: 'hidden lg:table-cell' },
  { key: 'stopCount', label: 'table.stops', numeric: true },
  { key: 'totalWeight', label: 'table.weight', numeric: true, className: 'hidden md:table-cell' },
  { key: 'weightUtilization', label: 'table.weightUtil' },
  { key: 'totalDurationMinutes', label: 'table.duration', numeric: true, className: 'hidden md:table-cell' },
  { key: 'timeUtilization', label: 'table.timeUtil' },
  { key: 'status', label: 'table.status' },
];

export function RoutesTable({ kpis, onOpen }: { kpis: RouteKPI[]; onOpen: (routeId: string) => void }) {
  const { t, num, locale } = useT();
  const [query, setQuery] = useState('');
  // Most urgent first by default.
  const [sort, setSort] = useState<{ key: SortKey; asc: boolean }>({ key: 'status', asc: true });

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q ? kpis.filter((k) => [k.routeId, k.driverName, k.vehicleType].some((v) => String(v || '').toLowerCase().includes(q))) : kpis;
    const value = (k: RouteKPI): string | number => (sort.key === 'status' ? routeStatus(k).rank : (k[sort.key] as string | number));
    return [...filtered].sort((a, b) => {
      const x = value(a), y = value(b);
      const r = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), locale, { numeric: true });
      return (sort.asc ? r : -r) || a.routeId.localeCompare(b.routeId, locale, { numeric: true });
    });
  }, [kpis, query, sort, locale]);

  const toggleSort = (key: SortKey) => setSort((s) => (s.key === key ? { key, asc: !s.asc } : { key, asc: key === 'status' || key === 'routeId' || key === 'driverName' || key === 'vehicleType' }));

  return (
    <Card className="overflow-hidden">
      <CardHeader
        title={t('table.title')}
        count={kpis.length}
        actions={
          <label className="relative block">
            <span className="sr-only">{t('table.search')}</span>
            <Search className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-subtle" aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('table.search')}
              className="h-8 w-64 max-w-full rounded border border-line bg-surface ps-8 pe-3 text-[13px] text-ink placeholder:text-ink-subtle focus:border-accent focus:outline-none focus:ring-2 focus:ring-focus"
            />
          </label>
        }
      />
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-line bg-surface-muted">
              {COLUMNS.map((c) => {
                const active = sort.key === c.key;
                const Icon = !active ? ChevronsUpDown : sort.asc ? ArrowUp : ArrowDown;
                return (
                  <th key={c.key} scope="col" aria-sort={active ? (sort.asc ? 'ascending' : 'descending') : 'none'} className={cn('whitespace-nowrap px-3 py-0 text-start font-medium', c.className)}>
                    <button
                      type="button"
                      onClick={() => toggleSort(c.key)}
                      className={cn('-mx-1 flex h-10 items-center gap-1 rounded px-1 text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus', active ? 'text-ink' : 'text-ink-muted hover:text-ink')}
                    >
                      {t(c.label)}
                      <Icon className={cn('size-3.5', !active && 'opacity-40')} aria-hidden />
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((k) => {
              const status = routeStatus(k);
              return (
                <tr
                  key={k.routeId}
                  tabIndex={0}
                  onClick={() => onOpen(k.routeId)}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onOpen(k.routeId))}
                  aria-label={t('table.openRoute', { id: k.routeId })}
                  className="cursor-pointer border-b border-line last:border-0 hover:bg-surface-hover focus-visible:bg-surface-selected focus-visible:outline-none"
                >
                  <td className="px-3 py-2.5 font-semibold text-ink tabular">{k.routeId}</td>
                  <td className="max-w-[12rem] truncate px-3 py-2.5 text-ink">
                    <span className="sensitive">{k.driverName || '—'}</span>
                  </td>
                  <td className="hidden max-w-[10rem] truncate px-3 py-2.5 text-ink-muted lg:table-cell">{k.vehicleType || '—'}</td>
                  <td className="px-3 py-2.5 text-ink tabular">{num(k.stopCount)}</td>
                  <td className="hidden px-3 py-2.5 text-ink tabular md:table-cell">{num(Math.round(k.totalWeight))}</td>
                  <td className="px-3 py-2.5">
                    <MeterCell value={k.weightUtilization} label={t('table.weightUtil')} />
                  </td>
                  <td className="hidden px-3 py-2.5 text-ink tabular md:table-cell">{hoursMinutes(k.totalDurationMinutes)}</td>
                  <td className="px-3 py-2.5">
                    <MeterCell value={k.timeUtilization} label={t('table.timeUtil')} />
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge tone={status.tone}>{t(status.label)}</Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && <p className="px-4 py-10 text-center text-sm text-ink-subtle">{t('table.noMatch')}</p>}
      </div>
    </Card>
  );
}
