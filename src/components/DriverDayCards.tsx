'use client';

import { useEffect, useState } from 'react';
import { useLanguage } from '@/context/LanguageContext';
import { t } from '@/i18n/translations';
import type { RouteActual, StopActual } from '@/lib/actualsComparison';
import { GROUP_COLOR, attentionFor, hoursMinutes, signed, type Group, type Attention } from '@/lib/pvaGroups';

const LEVEL_COLOR: Record<Attention['level'], string> = {
  high: '#dc2626',
  medium: '#ea580c',
  info: '#768390',
  good: '#0969da',
};
const LEVEL_ICON: Record<Attention['level'], string> = { high: '⛔', medium: '⚠️', info: 'ℹ️', good: '✅' };

function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
}

function stopColor(s: StopActual, routeColor: string): React.CSSProperties {
  switch (s.status) {
    case 'completed':
      return { background: routeColor };
    case 'at_stop':
      return { background: 'transparent', boxShadow: `inset 0 0 0 2px ${routeColor}` };
    case 'late':
      return { background: 'repeating-linear-gradient(45deg, #dc2626 0 3px, rgba(220,38,38,0.25) 3px 6px)' };
    default:
      return { background: 'var(--border-primary)' };
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
  const { language, isRTL } = useLanguage();
  const [hover, setHover] = useState<Hover | null>(null);
  const align = isRTL ? 'right' : 'left';

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
    <div style={{ marginBottom: 24 }}>
      <style>{`
        .ddc-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px; }
        .ddc-card { transition: transform .12s ease, box-shadow .12s ease; outline: none; }
        .ddc-card:hover, .ddc-card:focus-visible { transform: translateY(-2px); box-shadow: 0 6px 18px rgba(0,0,0,.18); }
        @keyframes ddc-pulse { 0%,100% { opacity: 1 } 50% { opacity: .35 } }
        .ddc-at-stop { animation: ddc-pulse 1.4s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) { .ddc-at-stop { animation: none; } .ddc-card { transition: none; } }
      `}</style>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>{t('pva.cards.title', language)}</h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, fontSize: 12, color: 'var(--text-secondary)' }}>
          {(['completed', 'at_stop', 'late', 'upcoming'] as const).map((st) => (
            <span key={st} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 16, height: 8, borderRadius: 2, display: 'inline-block', ...stopColor({ status: st } as StopActual, GROUP_COLOR.on_track) }} />
              {t(`pva.stop.${st}`, language)}
            </span>
          ))}
        </div>
      </div>

      <div className="ddc-grid">
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
              className="ddc-card"
              tabIndex={0}
              role="button"
              aria-label={`${t('kpi.route', language)} ${r.routeId}: ${t(`pva.group.${g}`, language)}, ${done}/${total} ${t('pva.stops', language)}`}
              onMouseEnter={(e) => open(r.routeId, e.currentTarget)}
              onMouseLeave={() => setHover(null)}
              onFocus={(e) => open(r.routeId, e.currentTarget)}
              onBlur={() => setHover(null)}
              onClick={(e) => (hover?.routeId === r.routeId ? setHover(null) : open(r.routeId, e.currentTarget))}
              style={{
                backgroundColor: 'var(--bg-card)',
                border: '1px solid var(--border-primary)',
                borderInlineStart: `5px solid ${color}`,
                borderRadius: 8,
                padding: '12px 14px',
                cursor: 'pointer',
                textAlign: align,
              }}
            >
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>{r.routeId}</span>
                <span style={{ filter: 'blur(4px)', color: 'var(--text-secondary)', fontSize: 13, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{r.driverName}</span>
                {r.vehicle && (
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)', border: '1px solid var(--border-primary)', borderRadius: 4, padding: '0 6px', whiteSpace: 'nowrap' }}>{r.vehicle}</span>
                )}
                <span style={{ marginInlineStart: 'auto', fontSize: 11, fontWeight: 700, color: 'white', background: color, borderRadius: 999, padding: '2px 9px', whiteSpace: 'nowrap' }}>
                  {t(`pva.group.${g}`, language)}
                </span>
              </div>

              {/* Stops progress */}
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 6 }}>
                <span style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1 }}>
                  {done}<span style={{ fontSize: 16, color: 'var(--text-tertiary)', fontWeight: 600 }}>/{total}</span>
                </span>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{t('pva.cards.stops_done', language)}</span>
                <span style={{ marginInlineStart: 'auto', fontSize: 12, color: 'var(--text-tertiary)' }}>{pct}%</span>
              </div>
              <div style={{ display: 'flex', gap: 3, marginBottom: 10 }} aria-hidden>
                {r.stops.map((s, i) => (
                  <span
                    key={i}
                    className={s.status === 'at_stop' ? 'ddc-at-stop' : undefined}
                    style={{ flex: 1, height: 10, borderRadius: 2, minWidth: 4, ...stopColor(s, color) }}
                  />
                ))}
              </div>

              {/* Footer */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
                <span>
                  {t('pva.cards.end', language)} <b style={{ color: 'var(--text-primary)' }}>{hm(r.projectedEnd)}</b>
                  {showDev && <b style={{ color }}> ({signed(dev)}′)</b>}
                </span>
                {warnings > 0 && (
                  <span style={{ marginInlineStart: 'auto', fontWeight: 700, color: LEVEL_COLOR.medium, whiteSpace: 'nowrap' }} title={t('pva.tt.attention', language)}>
                    ⚠ {warnings}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {hover && hovered && <Tooltip row={hovered} rect={hover.rect} hm={hm} />}
    </div>
  );
}

function Tooltip({ row, rect, hm }: { row: Row; rect: DOMRect; hm: (ms: number | null) => string }) {
  const { language, isRTL } = useLanguage();
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

  const line = (label: string, value: React.ReactNode) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '3px 0' }}>
      <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
      <span style={{ color: 'var(--text-primary)', fontWeight: 600, textAlign: 'end' }}>{value}</span>
    </div>
  );
  const delta = (n: number | null) => (n != null && Math.abs(n) >= 1 ? <span style={{ color: n > 0 ? '#ea580c' : '#16a34a' }}> ({signed(n)}′)</span> : null);

  return (
    <div
      role="tooltip"
      dir={isRTL ? 'rtl' : 'ltr'}
      style={{
        position: 'fixed', zIndex: 50, left, top, width: W,
        transform: below ? undefined : 'translateY(-100%)',
        backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-primary)', borderTop: `4px solid ${color}`,
        borderRadius: 8, boxShadow: '0 12px 32px rgba(0,0,0,.35)', padding: '12px 14px', fontSize: 12.5, pointerEvents: 'none',
        textAlign: isRTL ? 'right' : 'left',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <b style={{ fontSize: 15, color: 'var(--text-primary)' }}>{t('kpi.route', language)} {r.routeId}</b>
        <span style={{ filter: 'blur(4px)', color: 'var(--text-secondary)' }}>{r.driverName}</span>
        <span style={{ marginInlineStart: 'auto', color, fontWeight: 700 }}>{t(`pva.group.${g}`, language)}</span>
      </div>

      {line(t('pva.tt.departure', language), <>{hm(r.plannedStart)} → {r.actualStart != null ? hm(r.actualStart) : t('pva.tt.not_yet', language)}{r.actualStart != null && delta(r.startDelayMinutes)}</>)}
      {line(t('pva.tt.finish', language), <>{hm(r.plannedEnd)} → {hm(r.projectedEnd)}{delta(r.endDeviationMinutes)}</>)}
      {line(
        t('pva.tt.workday', language),
        <span style={{ color: r.projectedWorkMinutes != null && r.projectedWorkMinutes > r.workDayMinutes ? '#ea580c' : undefined }}>
          {hoursMinutes(r.projectedWorkMinutes)} / {hoursMinutes(r.workDayMinutes)}
        </span>
      )}
      {line(t('pva.tt.stops', language), <>{done}/{r.stops.length}{late > 0 && <span style={{ color: '#dc2626' }}> · {late} {t('pva.stop.late', language)}</span>}</>)}
      {r.plannedWeightKg > 0 && line(t('pva.tt.weight', language), <>{kg(r.deliveredWeightKg)} / {kg(r.plannedWeightKg)} {t('pva.tt.kg', language)}</>)}
      {r.plannedDistanceKm != null && line(t('pva.tt.distance', language), <>{r.plannedDistanceKm} {t('pva.tt.km', language)}</>)}
      {r.vehicle && line(t('pva.tt.vehicle', language), r.vehicle)}

      {(atStop || next) && (
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border-primary)' }}>
          {atStop ? (
            <div>
              <span style={{ color: 'var(--text-secondary)' }}>{t('pva.tt.at_stop_now', language)}: </span>
              <b style={{ color: 'var(--text-primary)' }}>{atStop.customer}</b>
              {atStop.city && <span style={{ color: 'var(--text-secondary)' }}>, {atStop.city}</span>}
              {atStop.minutesAtStop != null && (
                <div style={{ color: 'var(--text-secondary)', marginTop: 2 }}>
                  {fill(t('pva.tt.at_stop_for', language), { n: atStop.minutesAtStop, p: atStop.plannedServiceMinutes ?? '—' })}
                </div>
              )}
            </div>
          ) : (
            next && (
              <div>
                <span style={{ color: 'var(--text-secondary)' }}>{t('pva.tt.next_stop', language)}: </span>
                <b style={{ color: 'var(--text-primary)' }}>{next.customer}</b>
                {next.city && <span style={{ color: 'var(--text-secondary)' }}>, {next.city}</span>}
                <span style={{ color: next.status === 'late' ? '#dc2626' : 'var(--text-secondary)' }}> · {t('pva.tt.planned_at', language)} {hm(next.plannedArrival)}</span>
              </div>
            )
          )}
        </div>
      )}

      {att.length > 0 && (
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border-primary)' }}>
          <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>{t('pva.tt.attention', language)}</div>
          {att.map((a, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, padding: '2px 0', color: LEVEL_COLOR[a.level] }}>
              <span aria-hidden>{LEVEL_ICON[a.level]}</span>
              <span>{fill(t(a.key, language), a.vars)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
