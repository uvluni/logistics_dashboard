'use client';

import { Clock, Gauge, MapPin, Route, Scale, Weight } from 'lucide-react';
import type { DashboardSummary, RouteKPI } from '@/types';
import { useT } from '@/i18n/useT';
import { hoursMinutes } from '@/lib/dates';
import { Stat } from '@/components/ui/Stat';
import { utilizationTone } from '@/components/ui/Meter';
import { DEFAULT_WORKDAY_MIN } from './routeStatus';

export function PlanKpis({ summary, kpis }: { summary: DashboardSummary; kpis: RouteKPI[] }) {
  const { t, num } = useT();
  const workday = summary.normalWorkDay || kpis[0]?.normalWorkDayMinutes || DEFAULT_WORKDAY_MIN;
  const kg = kpis.reduce((s, k) => s + k.totalWeight, 0);
  const routes = summary.totalRoutes || kpis.length;
  const avgStops = routes ? summary.totalStops / routes : 0;
  const avgMinutes = routes ? summary.totalWorkMinutes / routes : 0;

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      <Stat label={t('kpi.routes')} icon={<Route />} value={num(routes)} />
      <Stat label={t('kpi.stops')} icon={<MapPin />} value={num(summary.totalStops)} hint={t('kpi.avgStops', { v: num(avgStops, 1) })} />
      <Stat label={t('kpi.weight')} icon={<Weight />} value={`${num(kg / 1000, 1)} ${t('common.tons')}`} />
      <Stat
        label={t('kpi.weightUtil')}
        icon={<Scale />}
        value={`${Math.round(summary.weightUtilization)}%`}
        meter={summary.weightUtilization}
        tone={utilizationTone(summary.weightUtilization) === 'danger' ? 'danger' : undefined}
      />
      <Stat
        label={t('kpi.timeUtil')}
        icon={<Gauge />}
        value={`${Math.round(summary.timeUtilization)}%`}
        meter={summary.timeUtilization}
        hint={t('kpi.ofWorkday', { h: num(workday / 60, 1) })}
        tone={utilizationTone(summary.timeUtilization) === 'danger' ? 'danger' : undefined}
      />
      <Stat label={t('kpi.workHours')} icon={<Clock />} value={hoursMinutes(summary.totalWorkMinutes)} hint={t('kpi.avgPerRoute', { v: hoursMinutes(avgMinutes) })} />
    </div>
  );
}
