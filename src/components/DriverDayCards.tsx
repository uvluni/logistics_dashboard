'use client';

import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import { t } from '@/i18n/translations';
import type { RouteActual, StopActual } from '@/lib/actualsComparison';
import { GROUP_COLOR, attentionFor, hoursMinutes, signed, type Group, type Attention } from '@/lib/pvaGroups';
import { Badge, type Tone } from '@/components/ui/Badge';
import { Card, CardHeader } from '@/components/ui/Card';
import { cn } from '@/components/ui/cn';

/** Badge tone for each plan-vs-actual group (the timeline and card accents keep GROUP_COLOR). */
export const GROUP_TONE: Record<Group, Tone> = {
  suspended: 'warning',
  overdue: 'danger',
  late: 'warning',
  on_track: 'success',
  ahead: 'info',
  not_started: 'neutral',
  completed: 'success',
};

/** Text color for a value shown in a group's tone (deviation minutes and the like). */
export const TONE_TEXT: Record<Tone, string> = {
  neutral: 'text-ink-muted',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
  info: 'text-info',
};

const LEVEL: Record<Attention['level'], { icon: ReactNode; className: string }> = {
  high: { icon: <XCircle aria-hidden />, className: 'text-danger' },
  medium: { icon: <AlertTriangle aria-hidden />, className: 'text-warning' },
  info: { icon: <Info aria-hidden />, className: 'text-ink-subtle' },
  good: { icon: <CheckCircle2 aria-hidden />, className: 'text-info' },
};

function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
}

/** Look of one stop segment: classes for the fixed states, an inline color for the route's own color. */
function stopLook(status: StopActual['status'], routeColor: string): { className: string; style?: CSSProperties } {
  switch (status) {
    case 'completed':
      return { className: '', style: { background: routeColor } };
    case 'at_stop':
      return { className: 'bg-transparent', style: { boxShadow: `inset 0 0 0 2px ${routeColor}` } };
    case 'late':
      return { className: 'bg-[repeating-linear-gradient(45deg,var(--danger)_0_3px,var(--danger-soft)_3px_6px)]' };
    default:
      return { className: 'bg-line' };
  }
}

interface Row {
  r: RouteActual;
  g: Group;
}

interface Hover {
  routeId: string;
  rect: DOMRect;
}

export default function DriverDayCards({ rows, hm }: { rows: Row[]; hm: (ms: number | null) => string }) {
  const { language } = useLanguage();
  const [hover, setHover] = useState<Hover | null>(null);

  // Close the tooltip when the page scrolls (its position is fixed to the viewport).
  useEffect(() => {
    if (!hover) return;
    const close = () => setHover(null);
    window.addEventListener('scroll', close, { passive: true });
    return () => window.removeEventListener('scroll', close);
  }, [hover]);

  const open = (routeId: string, el: HTMLElement) => setHover({ routeId, rect: el.getBoundingClientRect() });
  const hovered = hover ? rows.find((x) => x.r.routeId === hover.routeId) : undefined;

  return (
    <Card>
      <CardHeader
        title={t('pva.cards.title', language)}
        count={rows.length}
        actions={
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted">
            {(['completed', 'at_stop', 'late', 'upcoming'] as const).map((st) => {
              const look = stopLook(st, GROUP_COLOR.on_track);
              return (
                <span key={st} className="inline-flex items-center gap-1.5">
                  <span className={cn('h-2 w-4 rounded-sm', look.className)} style={look.style} aria-hidden />
                  {t(`pva.stop.${st}`, language)}
                </span>
              );
            })}
          </div>
        }
      />

      <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3 p-4">
        {rows.map(({ r, g }) => {
          const color = GROUP_COLOR[g];
          const done = r.stops.filter((s) => s.status === 'completed').length;
          const total = r.stops.length || r.stopsPlanned;
          const pct = total ? Math.round((done / total) * 100) : 0;
          const att = attentionFor(r, g);
          const warnings = att.filter((a) => a.level === 'high' || a.level === 'medium').length;
          const dev = g === 'overdue' ? r.startDelayMinutes : r.endDeviationMinutes;
          const showDev = dev != null && Math.abs(dev) >= 1 && g !== 'not_started' && g !== 'completed';
          return (
            <div
              key={r.routeId}
              tabIndex={0}
              role="button"
              aria-label={`${t('kpi.route', language)} ${r.routeId}: ${t(`pva.group.${g}`, language)}, ${done}/${total} ${t('pva.stops', language)}`}
              onMouseEnter={(e) => open(r.routeId, e.currentTarget)}
              onMouseLeave={() => setHover(null)}
              onFocus={(e) => open(r.routeId, e.currentTarget)}
              onBlur={() => setHover(null)}
              onClick={(e) => (hover?.routeId === r.routeId ? setHover(null) : open(r.routeId, e.currentTarget))}
              className={cn(
                'min-w-0 cursor-pointer rounded-lg border border-s-4 border-line bg-surface px-3.5 py-3 text-start',
                'transition-[transform,box-shadow] duration-150 hover:-translate-y-0.5 hover:shadow',
                'focus-visible:-translate-y-0.5 focus-visible:shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus'
              )}
              style={{ borderInlineStartColor: color }}
            >
              {/* Header */}
              <div className="mb-2.5 flex min-w-0 items-center gap-2">
                <span className="text-base font-semibold text-ink tabular">{r.routeId}</span>
                <span className="sensitive min-w-0 truncate text-[13px] text-ink-muted">{r.driverName}</span>
                {r.vehicle && <span className="whitespace-nowrap rounded-sm border border-line px-1.5 text-[11px] text-ink-muted">{r.vehicle}</span>}
                <Badge tone={GROUP_TONE[g]} className="ms-auto">
                  {t(`pva.group.${g}`, language)}
                </Badge>
              </div>

              {/* Stops progress */}
              <div className="mb-1.5 flex items-baseline gap-1.5">
                <span className="text-2xl font-semibold leading-none text-ink tabular">
                  {done}
                  <span className="text-base font-medium text-ink-subtle">/{total}</span>
                </span>
                <span className="text-xs text-ink-muted">{t('pva.cards.stops_done', language)}</span>
                <span className="ms-auto text-xs text-ink-subtle tabular">{pct}%</span>
              </div>
              <div className="mb-2.5 flex gap-[3px]" aria-hidden>
                {r.stops.map((s, i) => {
                  const look = stopLook(s.status, color);
                  return <span key={i} className={cn('h-2.5 min-w-1 flex-1 rounded-sm', look.className, s.status === 'at_stop' && 'animate-pulse')} style={look.style} />;
                })}
              </div>

              {/* Footer */}
              <div className="flex items-center gap-2 text-xs text-ink-muted">
                <span className="tabular">
                  {t('pva.cards.end', language)} <b className="font-semibold text-ink">{hm(r.projectedEnd)}</b>
                  {showDev && <b className={cn('font-semibold', TONE_TEXT[GROUP_TONE[g]])}> ({signed(dev)}′)</b>}
                </span>
                {warnings > 0 && (
                  <span className="ms-auto inline-flex items-center gap-1 whitespace-nowrap font-semibold text-warning" title={t('pva.tt.attention', language)}>
                    <AlertTriangle className="size-3.5" aria-hidden />
                    <span className="tabular">{warnings}</span>
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {hover && hovered && <Tooltip row={hovered} rect={hover.rect} hm={hm} />}
    </Card>
  );
}

function Tooltip({ row, rect, hm }: { row: Row; rect: DOMRect; hm: (ms: number | null) => string }) {
  const { language } = useLanguage();
  const { r, g } = row;
  const color = GROUP_COLOR[g];
  const W = 320;
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1200;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  const left = Math.min(Math.max(8, rect.left + rect.width / 2 - W / 2), vw - W - 8);
  const below = rect.bottom + 8 + 380 < vh || rect.top < 380;
  const top = below ? rect.bottom + 8 : rect.top - 8;

  const done = r.stops.filter((s) => s.status === 'completed').length;
  const late = r.stops.filter((s) => s.status === 'late').length;
  const atStop = r.stops.find((s) => s.status === 'at_stop');
  const next = r.stops.find((s) => s.status === 'late' || s.status === 'upcoming');
  const att = attentionFor(r, g);
  const kg = (n: number) => n.toLocaleString(language === 'he' ? 'he-IL' : language === 'es' ? 'es-ES' : 'en-US');

  const line = (label: string, value: ReactNode) => (
    <div className="flex justify-between gap-3 py-[3px]">
      <span className="text-ink-muted">{label}</span>
      <span className="text-end font-medium text-ink tabular">{value}</span>
    </div>
  );
  const delta = (n: number | null) => (n != null && Math.abs(n) >= 1 ? <span className={n > 0 ? 'text-warning' : 'text-success'}> ({signed(n)}′)</span> : null);

  return (
    <div
      role="tooltip"
      className="pointer-events-none fixed z-50 w-[320px] rounded-lg border border-t-4 border-line bg-surface px-3.5 py-3 text-start text-[12.5px] shadow-lg"
      style={{ left, top, transform: below ? undefined : 'translateY(-100%)', borderTopColor: color }}
    >
      <div className="mb-2 flex min-w-0 items-center gap-2">
        <b className="text-[15px] font-semibold text-ink">
          {t('kpi.route', language)} <span className="tabular">{r.routeId}</span>
        </b>
        <span className="sensitive min-w-0 truncate text-ink-muted">{r.driverName}</span>
        <Badge tone={GROUP_TONE[g]} className="ms-auto">
          {t(`pva.group.${g}`, language)}
        </Badge>
      </div>

      {line(t('pva.tt.departure', language), <>{hm(r.plannedStart)} → {r.actualStart != null ? hm(r.actualStart) : t('pva.tt.not_yet', language)}{r.actualStart != null && delta(r.startDelayMinutes)}</>)}
      {line(t('pva.tt.finish', language), <>{hm(r.plannedEnd)} → {hm(r.projectedEnd)}{delta(r.endDeviationMinutes)}</>)}
      {line(
        t('pva.tt.workday', language),
        <span className={r.projectedWorkMinutes != null && r.projectedWorkMinutes > r.workDayMinutes ? 'text-warning' : undefined}>
          {hoursMinutes(r.projectedWorkMinutes)} / {hoursMinutes(r.workDayMinutes)}
        </span>
      )}
      {line(t('pva.tt.stops', language), <>{done}/{r.stops.length}{late > 0 && <span className="text-danger"> · {late} {t('pva.stop.late', language)}</span>}</>)}
      {r.plannedWeightKg > 0 && line(t('pva.tt.weight', language), <>{kg(r.deliveredWeightKg)} / {kg(r.plannedWeightKg)} {t('pva.tt.kg', language)}</>)}
      {r.plannedDistanceKm != null && line(t('pva.tt.distance', language), <>{r.plannedDistanceKm} {t('pva.tt.km', language)}</>)}
      {r.vehicle && line(t('pva.tt.vehicle', language), r.vehicle)}

      {(atStop || next) && (
        <div className="mt-2 border-t border-line pt-2">
          {atStop ? (
            <div>
              <span className="text-ink-muted">{t('pva.tt.at_stop_now', language)}: </span>
              <b className="font-semibold text-ink">{atStop.customer}</b>
              {atStop.city && <span className="text-ink-muted">, {atStop.city}</span>}
              {atStop.minutesAtStop != null && (
                <div className="mt-0.5 text-ink-muted">
                  {fill(t('pva.tt.at_stop_for', language), { n: atStop.minutesAtStop, p: atStop.plannedServiceMinutes ?? '—' })}
                </div>
              )}
            </div>
          ) : (
            next && (
              <div>
                <span className="text-ink-muted">{t('pva.tt.next_stop', language)}: </span>
                <b className="font-semibold text-ink">{next.customer}</b>
                {next.city && <span className="text-ink-muted">, {next.city}</span>}
                <span className={next.status === 'late' ? 'text-danger' : 'text-ink-muted'}> · {t('pva.tt.planned_at', language)} {hm(next.plannedArrival)}</span>
              </div>
            )
          )}
        </div>
      )}

      {att.length > 0 && (
        <div className="mt-2 border-t border-line pt-2">
          <div className="mb-1 font-semibold text-ink">{t('pva.tt.attention', language)}</div>
          {att.map((a, i) => (
            <div key={i} className="flex gap-1.5 py-0.5 text-ink">
              <span className={cn('mt-px shrink-0 [&>svg]:size-3.5', LEVEL[a.level].className)}>{LEVEL[a.level].icon}</span>
              <span>{fill(t(a.key, language), a.vars)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
