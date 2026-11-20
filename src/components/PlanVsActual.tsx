'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AlarmClockOff, CalendarX2, CirclePause, FastForward, Hourglass, MapPin, RefreshCw, Truck } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import { t } from '@/i18n/translations';
import type { ActualsResponse } from '@/lib/actualsComparison';
import { GROUP_COLOR, groupOf, signed, sortByUrgency, type Group } from '@/lib/pvaGroups';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button, IconButton } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card, CardHeader } from '@/components/ui/Card';
import { Stat } from '@/components/ui/Stat';
import { Alert, EmptyState, Skeleton } from '@/components/ui/Feedback';
import { cn } from '@/components/ui/cn';
import DriverDayCards, { GROUP_TONE, TONE_TEXT } from '@/components/DriverDayCards';

const REFRESH_MS = 2 * 60 * 1000;
const TIME_ZONE = 'Asia/Jerusalem';

// The working date is chosen in the top navigation; `onDateChange` stays in the signature for AppShell.
export default function PlanVsActual({ sessionDate }: { sessionDate: string; onDateChange: (d: string) => void }) {
  const { language } = useLanguage();
  const [data, setData] = useState<ActualsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [now, setNow] = useState(() => Date.now());

  const fmt = useMemo(
    () => new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit', hour12: false }),
    []
  );
  const hm = (ms: number | null) => (ms == null ? '—' : fmt.format(ms));

  const load = useCallback(async () => {
    if (!sessionDate) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/actuals?sessionDate=${sessionDate}`, { credentials: 'include', cache: 'no-store' });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      setData(body);
      setNow(Date.now());
    } catch (e: any) {
      setError(`${t('pva.load_error', language)}: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }, [sessionDate, language]);

  useEffect(() => {
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  const rows = useMemo(() => {
    if (!data) return [];
    return sortByUrgency(data.routes.map((r) => ({ r, g: groupOf(r) as Group })));
  }, [data]);

  // Shared time axis, rounded out to whole hours.
  const axis = useMemo(() => {
    if (!data || data.routes.length === 0) return null;
    const ts = data.routes.flatMap((r) => [r.plannedStart, r.actualStart, r.plannedEnd, r.projectedEnd]).filter((x): x is number => x != null);
    if (ts.length === 0) return null;
    const hour = 3600e3;
    const start = Math.floor(Math.min(...ts, now) / hour) * hour;
    const end = Math.ceil(Math.max(...ts, now) / hour) * hour;
    const ticks: number[] = [];
    const step = end - start > 10 * hour ? 2 * hour : hour;
    for (let x = start; x <= end; x += step) ticks.push(x);
    return { start, end, ticks };
  }, [data, now]);

  const pos = (ms: number) => (axis ? ((ms - axis.start) / (axis.end - axis.start)) * 100 : 0);
  const isToday = data ? data.routes.some((r) => r.actualStart != null) || sessionDate === new Date().toISOString().slice(0, 10) : false;

  const groupLabel = (g: Group) => t(`pva.group.${g}`, language);
  const tot = data?.totals;
  const hasRoutes = !!data && !!tot && data.routes.length > 0;

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('pva.title', language)}
        subtitle={
          data ? (
            <span className="tabular">
              {t('pva.as_of', language)} {hm(data.asOf)} · {t('pva.last_data', language)} {hm(data.lastDataCapturedAt)} · {t('pva.auto_refresh', language)}
            </span>
          ) : undefined
        }
        actions={
          <IconButton
            variant="secondary"
            label={loading ? t('pva.refreshing', language) : t('pva.refresh', language)}
            icon={<RefreshCw className={loading ? 'animate-spin' : undefined} />}
            onClick={load}
            disabled={loading}
          />
        }
      />

      {error && (
        <Alert tone="danger" action={<Button size="sm" onClick={load} disabled={loading}>{t('pva.refresh', language)}</Button>}>
          {error}
        </Alert>
      )}

      {!data && loading && <PvaSkeleton label={t('pva.loading', language)} />}

      {data && data.routes.length === 0 && (
        <Card>
          <EmptyState icon={<CalendarX2 />} title={t('pva.no_routes', language)} />
        </Card>
      )}

      {hasRoutes && tot && (
        <>
          {/* KPI tiles */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Stat label={t('pva.tile.started', language)} icon={<Truck />} value={`${tot.started}/${tot.routes}`} />
            <Stat label={t('pva.tile.overdue', language)} icon={<AlarmClockOff />} value={tot.notStartedOverdue} tone={tot.notStartedOverdue ? 'danger' : undefined} />
            <Stat label={t('pva.tile.suspended', language)} icon={<CirclePause />} value={tot.suspended} tone={tot.suspended ? 'warning' : undefined} />
            <Stat
              label={t('pva.tile.late', language)}
              icon={<Hourglass />}
              value={tot.late}
              tone={tot.late ? 'warning' : undefined}
              hint={t('pva.tile.late_sub', language)}
            />
            <Stat label={t('pva.tile.ahead', language)} icon={<FastForward />} value={tot.ahead} tone={tot.ahead ? 'info' : undefined} />
            <Stat
              label={t('pva.tile.stops', language)}
              icon={<MapPin />}
              value={`${tot.stopsArrived}/${tot.stopsDueByNow}`}
              tone={tot.stopsArrived < tot.stopsDueByNow ? 'warning' : 'success'}
              hint={`${t('pva.tile.stops_sub', language)} ${tot.stopsCompleted}/${tot.stopsPlanned}`}
            />
          </div>

          {/* Driver workday cards */}
          <DriverDayCards rows={rows} hm={hm} />

          {/* Timeline */}
          <Card>
            <CardHeader
              title={t('pva.timeline', language)}
              count={rows.length}
              actions={
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted">
                  <LegendItem swatch={<span className="h-2 w-5 rounded-sm border-[1.5px] border-ink-subtle" />} label={t('pva.legend.plan', language)} />
                  <LegendItem swatch={<span className="h-2 w-5 rounded-sm" style={{ background: GROUP_COLOR.on_track }} />} label={t('pva.legend.actual', language)} />
                  <LegendItem swatch={<span className="h-2 w-5 rounded-sm opacity-[.35]" style={{ background: GROUP_COLOR.on_track }} />} label={t('pva.legend.projection', language)} />
                  {isToday && <LegendItem swatch={<span className="h-3.5 w-0.5 bg-danger" />} label={t('pva.legend.now', language)} />}
                </div>
              }
            />

            <div className="px-4 pb-2 pt-3">
              {axis && (
                <div className="mb-1 grid grid-cols-1 gap-1.5 md:grid-cols-[230px_minmax(0,1fr)] md:gap-3">
                  <div className="hidden md:block" />
                  <div className="relative h-[18px] text-[11px] text-ink-subtle tabular">
                    {axis.ticks.map((x) => (
                      <span key={x} className="absolute -translate-x-1/2 rtl:translate-x-1/2" style={{ insetInlineStart: `${pos(x)}%` }}>
                        {hm(x)}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {rows.map(({ r, g }) => {
                const color = GROUP_COLOR[g];
                const barStart = r.actualStart ?? (g === 'overdue' ? now : null);
                const barEnd = r.projectedEnd;
                const solidEnd = barStart != null && barEnd != null ? Math.min(Math.max(now, barStart), barEnd) : null;
                const dev = r.status === 'not_started_overdue' ? r.startDelayMinutes : r.endDeviationMinutes;
                const showDev = dev != null && Math.abs(dev) >= 1 && g !== 'not_started' && g !== 'completed';
                const devClass = TONE_TEXT[GROUP_TONE[g]];
                return (
                  <div
                    key={r.routeId}
                    className="grid grid-cols-1 items-center gap-1.5 border-b border-line py-2.5 last:border-0 md:grid-cols-[230px_minmax(0,1fr)] md:gap-3"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[15px] font-semibold text-ink tabular">{r.routeId}</span>
                        <span className="sensitive min-w-0 truncate text-[13px] text-ink-muted">{r.driverName}</span>
                        <Badge tone={GROUP_TONE[g]}>{groupLabel(g)}</Badge>
                      </div>
                      <div className="mt-0.5 text-xs text-ink-muted tabular">
                        {t('pva.stops', language)} {r.stopsArrived}/{r.stopsDueByNow} · {t('pva.end', language)} {hm(r.plannedEnd)} →{' '}
                        <b className={cn('font-semibold', showDev ? devClass : 'text-ink')}>{hm(r.projectedEnd)}</b>
                        {showDev && <b className={cn('font-semibold', devClass)}> ({signed(dev)}′)</b>}
                      </div>
                    </div>

                    <div
                      className="relative h-[30px]"
                      title={`${t('pva.plan', language)} ${hm(r.plannedStart)}–${hm(r.plannedEnd)} · ${t('pva.actual', language)} ${hm(r.actualStart)}–${hm(r.projectedEnd)}`}
                    >
                      {/* Planned window */}
                      {r.plannedStart != null && r.plannedEnd != null && (
                        <div
                          className="absolute top-0.5 h-2.5 rounded-sm border-[1.5px] border-ink-subtle"
                          style={{ insetInlineStart: `${pos(r.plannedStart)}%`, width: `${Math.max(pos(r.plannedEnd) - pos(r.plannedStart), 0.5)}%` }}
                        />
                      )}
                      {/* Actual so far + projection */}
                      {barStart != null && barEnd != null && solidEnd != null && (
                        <>
                          <div
                            className="absolute top-4 h-2.5 rounded-sm opacity-[.35]"
                            style={{ background: color, insetInlineStart: `${pos(barStart)}%`, width: `${Math.max(pos(barEnd) - pos(barStart), 0.5)}%` }}
                          />
                          {r.actualStart != null && (
                            <div
                              className="absolute top-4 h-2.5 rounded-sm"
                              style={{ background: color, insetInlineStart: `${pos(barStart)}%`, width: `${Math.max(pos(solidEnd) - pos(barStart), 0.5)}%` }}
                            />
                          )}
                        </>
                      )}
                      {/* Now */}
                      {isToday && axis && now >= axis.start && now <= axis.end && (
                        <div className="absolute -bottom-1 -top-1 w-0.5 bg-danger" style={{ insetInlineStart: `${pos(now)}%` }} />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          <p className="text-xs text-ink-subtle">{t('pva.footnote', language)}</p>
        </>
      )}
    </div>
  );
}

function LegendItem({ swatch, label }: { swatch: ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-flex items-center" aria-hidden>
        {swatch}
      </span>
      {label}
    </span>
  );
}

function PvaSkeleton({ label }: { label: string }) {
  return (
    <div className="space-y-5" role="status" aria-label={label}>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-[104px] rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-lg" />
      <Skeleton className="h-96 rounded-lg" />
    </div>
  );
}
