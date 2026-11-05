'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLanguage } from '@/context/LanguageContext';
import { t } from '@/i18n/translations';
import type { ActualsResponse } from '@/lib/actualsComparison';
import { GROUP_COLOR, groupOf, signed, sortByUrgency, type Group } from '@/lib/pvaGroups';
import DriverDayCards from '@/components/DriverDayCards';

const REFRESH_MS = 2 * 60 * 1000;
const TIME_ZONE = 'Asia/Jerusalem';

export default function PlanVsActual({ sessionDate, onDateChange }: { sessionDate: string; onDateChange: (d: string) => void }) {
  const { language, isRTL } = useLanguage();
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
  const align = isRTL ? 'right' : 'left';

  const tile = (label: string, value: string, color?: string, sub?: string) => (
    <div className="pva-tile" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-primary)', borderRadius: 8, padding: 16, textAlign: align }}>
      <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginBottom: 6 }}>{label}</div>
      <div style={{ color: color || 'var(--text-primary)', fontSize: 26, fontWeight: 700, lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ color: 'var(--text-tertiary)', fontSize: 12, marginTop: 4 }}>{sub}</div>}
    </div>
  );

  const tot = data?.totals;

  return (
    <div dir={isRTL ? 'rtl' : 'ltr'}>
      <style>{`
        .pva-tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-bottom: 24px; }
        .pva-row { display: grid; grid-template-columns: 230px 1fr; gap: 12px; align-items: center; padding: 10px 0; border-bottom: 1px solid var(--border-primary); }
        .pva-track { position: relative; height: 30px; }
        .pva-axis { display: grid; grid-template-columns: 230px 1fr; gap: 12px; }
        @media (max-width: 760px) {
          .pva-row, .pva-axis { grid-template-columns: 1fr; gap: 6px; }
          .pva-axis-spacer { display: none; }
        }
      `}</style>

      {/* Header */}
      <div style={{ backgroundColor: 'var(--bg-secondary)', borderRadius: 6, border: '1px solid var(--border-primary)', padding: 24, marginBottom: 24 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: 20, fontWeight: 600, margin: 0, color: 'var(--text-primary)' }}>{t('pva.title', language)}</h2>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              type="date"
              value={sessionDate}
              onChange={(e) => e.target.value && onDateChange(e.target.value)}
              style={{ padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border-primary)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 14 }}
            />
            <button
              onClick={load}
              disabled={loading}
              style={{ padding: '8px 16px', borderRadius: 6, fontWeight: 600, backgroundColor: 'var(--color-blue)', color: 'white', border: 'none', cursor: loading ? 'default' : 'pointer', fontSize: 14, opacity: loading ? 0.7 : 1 }}
            >
              {loading ? t('pva.refreshing', language) : t('pva.refresh', language)}
            </button>
          </div>
        </div>
        {data && (
          <p style={{ margin: '12px 0 0', color: 'var(--text-secondary)', fontSize: 13, textAlign: align }}>
            {t('pva.as_of', language)} {hm(data.asOf)} · {t('pva.last_data', language)} {hm(data.lastDataCapturedAt)} · {t('pva.auto_refresh', language)}
          </p>
        )}
      </div>

      {error && <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', padding: '12px 16px', borderRadius: 8, marginBottom: 24 }}>{error}</div>}
      {!data && loading && <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: 48 }}>{t('pva.loading', language)}</div>}
      {data && data.routes.length === 0 && (
        <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: 48, backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-primary)', borderRadius: 8 }}>
          {t('pva.no_routes', language)}
        </div>
      )}

      {data && tot && data.routes.length > 0 && (
        <>
          {/* KPI tiles */}
          <div className="pva-tiles">
            {tile(t('pva.tile.started', language), `${tot.started}/${tot.routes}`)}
            {tile(t('pva.tile.overdue', language), String(tot.notStartedOverdue), tot.notStartedOverdue ? GROUP_COLOR.overdue : undefined)}
            {tile(t('pva.tile.suspended', language), String(tot.suspended), tot.suspended ? GROUP_COLOR.suspended : undefined)}
            {tile(t('pva.tile.late', language), String(tot.late), tot.late ? GROUP_COLOR.late : undefined, t('pva.tile.late_sub', language))}
            {tile(t('pva.tile.ahead', language), String(tot.ahead), tot.ahead ? GROUP_COLOR.ahead : undefined)}
            {tile(
              t('pva.tile.stops', language),
              `${tot.stopsArrived}/${tot.stopsDueByNow}`,
              tot.stopsArrived < tot.stopsDueByNow ? GROUP_COLOR.late : GROUP_COLOR.on_track,
              `${t('pva.tile.stops_sub', language)} ${tot.stopsCompleted}/${tot.stopsPlanned}`
            )}
          </div>

          {/* Driver workday cards */}
          <DriverDayCards rows={rows} hm={hm} />

          {/* Timeline */}
          <div style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-primary)', borderRadius: 8, padding: '16px 20px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>{t('pva.timeline', language)}</h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, fontSize: 12, color: 'var(--text-secondary)' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 22, height: 8, border: '1.5px solid var(--text-tertiary)', borderRadius: 3, display: 'inline-block' }} />
                  {t('pva.legend.plan', language)}
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 22, height: 8, background: GROUP_COLOR.on_track, borderRadius: 3, display: 'inline-block' }} />
                  {t('pva.legend.actual', language)}
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 22, height: 8, background: GROUP_COLOR.on_track, opacity: 0.35, borderRadius: 3, display: 'inline-block' }} />
                  {t('pva.legend.projection', language)}
                </span>
                {isToday && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 2, height: 14, background: '#dc2626', display: 'inline-block' }} />
                    {t('pva.legend.now', language)}
                  </span>
                )}
              </div>
            </div>

            {axis && (
              <div className="pva-axis" style={{ marginBottom: 4 }}>
                <div className="pva-axis-spacer" />
                <div style={{ position: 'relative', height: 18, fontSize: 11, color: 'var(--text-tertiary)' }}>
                  {axis.ticks.map((x) => (
                    <span key={x} style={{ position: 'absolute', insetInlineStart: `${pos(x)}%`, transform: isRTL ? 'translateX(50%)' : 'translateX(-50%)' }}>
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
              return (
                <div key={r.routeId} className="pva-row">
                  <div style={{ textAlign: align, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: 15 }}>{r.routeId}</span>
                      <span style={{ filter: 'blur(4px)', color: 'var(--text-secondary)', fontSize: 13 }}>{r.driverName}</span>
                      <span style={{ fontSize: 11, fontWeight: 600, color, border: `1px solid ${color}`, borderRadius: 999, padding: '1px 8px', whiteSpace: 'nowrap' }}>
                        {groupLabel(g)}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3 }}>
                      {t('pva.stops', language)} {r.stopsArrived}/{r.stopsDueByNow} · {t('pva.end', language)} {hm(r.plannedEnd)} → <b style={{ color: showDev ? color : 'var(--text-primary)' }}>{hm(r.projectedEnd)}</b>
                      {showDev && <b style={{ color }}> ({signed(dev)}′)</b>}
                    </div>
                  </div>

                  <div className="pva-track" title={`${t('pva.plan', language)} ${hm(r.plannedStart)}–${hm(r.plannedEnd)} · ${t('pva.actual', language)} ${hm(r.actualStart)}–${hm(r.projectedEnd)}`}>
                    {/* Planned window */}
                    {r.plannedStart != null && r.plannedEnd != null && (
                      <div
                        style={{
                          position: 'absolute', top: 2, height: 10, borderRadius: 3,
                          border: '1.5px solid var(--text-tertiary)',
                          insetInlineStart: `${pos(r.plannedStart)}%`,
                          width: `${Math.max(pos(r.plannedEnd) - pos(r.plannedStart), 0.5)}%`,
                        }}
                      />
                    )}
                    {/* Actual so far + projection */}
                    {barStart != null && barEnd != null && solidEnd != null && (
                      <>
                        <div
                          style={{
                            position: 'absolute', top: 16, height: 10, borderRadius: 3, background: color, opacity: 0.35,
                            insetInlineStart: `${pos(barStart)}%`, width: `${Math.max(pos(barEnd) - pos(barStart), 0.5)}%`,
                          }}
                        />
                        {r.actualStart != null && (
                          <div
                            style={{
                              position: 'absolute', top: 16, height: 10, borderRadius: 3, background: color,
                              insetInlineStart: `${pos(barStart)}%`, width: `${Math.max(pos(solidEnd) - pos(barStart), 0.5)}%`,
                            }}
                          />
                        )}
                      </>
                    )}
                    {/* Now */}
                    {isToday && axis && now >= axis.start && now <= axis.end && (
                      <div style={{ position: 'absolute', top: -4, bottom: -4, width: 2, background: '#dc2626', insetInlineStart: `${pos(now)}%` }} />
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <p style={{ color: 'var(--text-tertiary)', fontSize: 12, marginTop: 12, textAlign: align }}>{t('pva.footnote', language)}</p>
        </>
      )}
    </div>
  );
}
