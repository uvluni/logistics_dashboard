'use client';

import type { ReactNode } from 'react';
import { Lightbulb } from 'lucide-react';
import type { RouteKPI } from '@/types';
import { useT } from '@/i18n/useT';
import { hoursMinutes } from '@/lib/dates';
import { Drawer } from '@/components/ui/Drawer';
import { Badge } from '@/components/ui/Badge';
import { Meter, utilizationTone } from '@/components/ui/Meter';
import { routeStatus, workdayOf } from './routeStatus';

/** Everything about one route: time split, load per round and the route's own insights. */
export function RouteDrawer({ route, onClose }: { route: RouteKPI | null; onClose: () => void }) {
  const { t, num } = useT();
  if (!route) return null;
  const status = routeStatus(route);
  const total = route.totalDurationMinutes || 1;
  const other = Math.max(0, route.totalDurationMinutes - route.travelTimeMinutes - route.serviceTimeMinutes);

  return (
    <Drawer
      open
      onClose={onClose}
      closeLabel={t('common.close')}
      title={
        <span className="flex items-center gap-2">
          {t('route.title', { id: route.routeId })}
          <Badge tone={status.tone}>{t(status.label)}</Badge>
        </span>
      }
      subtitle={
        <span>
          <span className="sensitive">{route.driverName}</span>
          {route.vehicleType && <> · {route.vehicleType}</>} · {t('kpi.stops')}: {num(route.stopCount)}
        </span>
      }
    >
      <div className="space-y-6">
        <Section title={t('route.time')}>
          <div className="mb-3 flex items-baseline justify-between">
            <span className="text-[13px] text-ink-muted">{t('route.total')}</span>
            <span className="text-lg font-semibold text-ink tabular">
              {hoursMinutes(route.totalDurationMinutes)}
              <span className="ms-2 text-[13px] font-normal text-ink-subtle">/ {hoursMinutes(workdayOf(route))}</span>
            </span>
          </div>
          {/* Time split as one stacked bar */}
          <div className="flex h-2.5 overflow-hidden rounded-full bg-surface-muted" aria-hidden>
            <div className="bg-brand-navy dark:bg-info" style={{ width: `${(route.travelTimeMinutes / total) * 100}%` }} />
            <div className="bg-brand-cyan" style={{ width: `${(route.serviceTimeMinutes / total) * 100}%` }} />
            <div className="bg-line-strong" style={{ width: `${(other / total) * 100}%` }} />
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-[13px]">
            <Legend color="bg-brand-navy dark:bg-info" label={t('route.travel')} value={hoursMinutes(route.travelTimeMinutes)} />
            <Legend color="bg-brand-cyan" label={t('route.service')} value={hoursMinutes(route.serviceTimeMinutes)} />
          </dl>
          <div className="mt-4">
            <Row label={t('kpi.timeUtil')} value={`${Math.round(route.timeUtilization)}%`} />
            <Meter value={route.timeUtilization} label={t('kpi.timeUtil')} className="mt-1.5" />
          </div>
        </Section>

        <Section title={t('route.load')}>
          <Row label={t('kpi.weight')} value={`${num(Math.round(route.totalWeight))} ${t('common.kg')}`} />
          <Row label={t('route.capacity')} value={route.vehicleCapacity ? `${num(Math.round(route.vehicleCapacity))} ${t('common.kg')}` : '—'} />
          <div className="mt-3">
            <Row label={t('kpi.weightUtil')} value={`${Math.round(route.weightUtilization)}%`} />
            <Meter value={route.weightUtilization} label={t('kpi.weightUtil')} className="mt-1.5" />
          </div>
          {route.rounds && route.rounds.length > 1 && (
            <div className="mt-4 space-y-3">
              <h4 className="text-[13px] font-medium text-ink">{t('route.rounds')}</h4>
              {route.rounds.map((r) => (
                <div key={r.roundNumber}>
                  <div className="flex items-baseline justify-between text-[13px]">
                    <span className="text-ink">{t('route.round', { n: r.roundNumber })}</span>
                    <span className="text-ink-subtle tabular">
                      {t('route.roundDetail', { w: num(Math.round(r.weight)), s: r.stopCount })} · <span className={utilizationTone(r.weightUtilization) === 'danger' ? 'font-semibold text-danger' : 'text-ink'}>{Math.round(r.weightUtilization)}%</span>
                    </span>
                  </div>
                  <Meter value={r.weightUtilization} label={t('route.round', { n: r.roundNumber })} className="mt-1.5" />
                </div>
              ))}
            </div>
          )}
        </Section>

        {route.insights?.length > 0 && (
          <Section title={t('route.insights')}>
            <ul className="space-y-2">
              {route.insights.map((text, i) => (
                <li key={i} className="flex gap-2 text-sm text-ink-muted">
                  <Lightbulb className="mt-0.5 size-4 shrink-0 text-ink-subtle" aria-hidden />
                  {text}
                </li>
              ))}
            </ul>
          </Section>
        )}
      </div>
    </Drawer>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-subtle">{title}</h3>
      {children}
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between py-0.5 text-[13px]">
      <span className="text-ink-muted">{label}</span>
      <span className="font-medium text-ink tabular">{value}</span>
    </div>
  );
}

function Legend({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`size-2.5 rounded-sm ${color}`} aria-hidden />
      <dt className="text-ink-muted">{label}</dt>
      <dd className="ms-auto font-medium text-ink tabular">{value}</dd>
    </div>
  );
}
