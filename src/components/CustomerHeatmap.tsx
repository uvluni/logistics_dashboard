'use client';

// Customer heat map: where the customers are and how many visits / how much planned weight they
// get over a period. Leaflet + leaflet.heat on OpenStreetMap (Esri fallback). Data: /api/heatmap.
import 'leaflet/dist/leaflet.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Map as LeafletMap, CircleMarker } from 'leaflet';
import { CalendarDays, Loader2, MapPin, Route, Users, Weight } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import { t } from '@/i18n/translations';
import { formatDmy } from '@/lib/dates';
import type { CustomerHeat, HeatCustomer } from '@/lib/customerHeat';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Stat } from '@/components/ui/Stat';
import { Alert, EmptyState, Skeleton } from '@/components/ui/Feedback';
import { cn } from '@/components/ui/cn';

const TILE_SOURCES: [string, string][] = [
  ['https://tile.openstreetmap.org/{z}/{x}/{y}.png', '&copy; OpenStreetMap'],
  ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', 'Tiles &copy; Esri'],
];
const GRADIENT = { 0.2: '#2b83ba', 0.4: '#abdda4', 0.6: '#ffffbf', 0.8: '#fdae61', 1: '#d7191c' };
const TOP = 25;
const MAX_DAYS = 92;

const TH = 'h-10 whitespace-nowrap px-3 text-start text-[13px] font-medium text-ink-muted';
const TD = 'px-3 py-2.5';
const SEGMENT = 'inline-flex items-center gap-0.5 rounded border border-line bg-surface p-0.5 shadow-sm';
const segButton = (on: boolean) =>
  cn(
    'h-7 rounded-sm px-3 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
    on ? 'bg-primary text-primary-fg' : 'text-ink-muted hover:bg-surface-hover hover:text-ink'
  );

const escHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const addDays = (iso: string, n: number) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
const dm = (iso: string) => {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

type Metric = 'visits' | 'kg';
type Mode = 'heat' | 'dots';

/** A period date: shows dd/mm/yyyy in every locale; the hidden native input supplies the calendar. */
function PeriodDate({ label, value, onChange }: { label: string; value: string; onChange: (iso: string) => void }) {
  const picker = useRef<HTMLInputElement>(null);
  const open = () => {
    const el = picker.current;
    if (!el) return;
    try {
      el.showPicker();
    } catch {
      el.focus();
      el.click();
    }
  };
  return (
    <label className="flex items-center gap-2 text-[13px] text-ink-muted">
      {label}
      <span className="relative">
        <button
          type="button"
          onClick={open}
          className="flex h-9 items-center gap-2 rounded border border-line bg-surface px-3 text-[13px] font-medium text-ink shadow-sm hover:border-line-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          <CalendarDays className="size-4 text-ink-subtle" aria-hidden />
          <span className="tabular" dir="ltr">
            {formatDmy(value) || '--/--/----'}
          </span>
        </button>
        <input
          ref={picker}
          type="date"
          value={value}
          onChange={(e) => e.target.value && onChange(e.target.value)}
          tabIndex={-1}
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-0"
        />
      </span>
    </label>
  );
}

export default function CustomerHeatmap({ sessionDate }: { sessionDate: string }) {
  const { language } = useLanguage();
  const end0 = sessionDate || new Date().toISOString().slice(0, 10);
  const [to, setTo] = useState(end0);
  const [from, setFrom] = useState(addDays(end0, -29));
  const [data, setData] = useState<CustomerHeat | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [metric, setMetric] = useState<Metric>('visits');
  const [mode, setMode] = useState<Mode>('heat');
  const [reportedOnly, setReportedOnly] = useState(false);
  const [tilesFailed, setTilesFailed] = useState(false);
  const mapEl = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markersRef = useRef<CircleMarker[]>([]);
  const nf = useMemo(() => new Intl.NumberFormat(language === 'he' ? 'he-IL' : language === 'es' ? 'es-ES' : 'en-US'), [language]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/heatmap?from=${from}&to=${to}`, { credentials: 'include', cache: 'no-store' });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      setData(body);
    } catch (e: any) {
      setData(null);
      setError(`${t('heat.load_error', language)}: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }, [from, to, language]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useCallback(
    (c: HeatCustomer) => (metric === 'kg' ? (reportedOnly ? c.reportedKg : c.kg) : reportedOnly ? c.reportedVisits : c.visits),
    [metric, reportedOnly]
  );
  const rows = useMemo(() => (data ? data.customers.filter((c) => value(c) > 0).sort((a, b) => value(b) - value(a)) : []), [data, value]);

  const tipFor = useCallback(
    (c: HeatCustomer) =>
      `<b class="sensitive">${escHtml(c.name)}</b>${c.city ? '<br>' + escHtml(c.city) : ''}` +
      `<br>${escHtml(t('heat.tip_visits', language).replace('{v}', String(c.visits)).replace('{r}', String(c.reportedVisits)))}` +
      `<br>${escHtml(t('heat.tip_kg', language).replace('{k}', nf.format(c.kg)))}` +
      `<br>${escHtml(t('heat.tip_days', language).replace('{d}', String(c.days)).replace('{last}', dm(c.lastVisit)))}` +
      (c.routes.length ? `<br>${escHtml(t('heat.tip_routes', language).replace('{r}', c.routes.slice(0, 8).join(', ') + (c.routes.length > 8 ? '…' : '')))}` : ''),
    [language, nf]
  );

  // Draw the map whenever data / metric / mode / filter change.
  useEffect(() => {
    if (!data || !mapEl.current) return;
    let disposed = false;
    (async () => {
      const L = (await import('leaflet')).default;
      (window as any).L = L; // leaflet.heat extends the global L
      await import('leaflet.heat');
      if (disposed || !mapEl.current) return;
      mapRef.current?.remove();
      const map = L.map(mapEl.current);
      mapRef.current = map;
      setTilesFailed(false);
      const trySource = (k: number) => {
        let errors = 0;
        let ok = 0;
        const layer = L.tileLayer(TILE_SOURCES[k][0], { maxZoom: 19, attribution: TILE_SOURCES[k][1] });
        layer.on('tileload', () => {
          ok++;
        });
        layer.on('tileerror', () => {
          errors++;
          if (ok || errors < 4) return;
          layer.off();
          map.removeLayer(layer);
          if (k + 1 < TILE_SOURCES.length) trySource(k + 1);
          else setTilesFailed(true);
        });
        layer.addTo(map);
      };
      trySource(0);

      // Scale to the 95th percentile so one huge customer doesn't wash out the rest.
      const vals = rows.map(value).sort((a, b) => a - b);
      const cap = vals.length ? vals[Math.min(vals.length - 1, Math.floor(vals.length * 0.95))] || 1 : 1;
      const markers: CircleMarker[] = [];
      if (mode === 'heat') {
        (L as any).heatLayer(rows.map((c) => [c.lat, c.lon, Math.min(1, value(c) / cap)]), { radius: 22, blur: 18, maxZoom: 12, minOpacity: 0.35, gradient: GRADIENT }).addTo(map);
        const dots = L.layerGroup();
        rows.forEach((c) => markers.push(L.circleMarker([c.lat, c.lon], { radius: 5, color: '#fff', weight: 1, fillColor: '#043d5c', fillOpacity: 0.55 }).bindTooltip(tipFor(c)).addTo(dots)));
        const sync = () => (map.getZoom() >= 11 ? dots.addTo(map) : map.removeLayer(dots));
        map.on('zoomend', sync);
        setTimeout(() => !disposed && sync(), 350);
      } else {
        const color = (f: number) => (f > 0.8 ? '#d7191c' : f > 0.6 ? '#fdae61' : f > 0.4 ? '#e6c84f' : f > 0.2 ? '#7cc39a' : '#2b83ba');
        const tmp: CircleMarker[] = [];
        rows.slice().reverse().forEach((c) => {
          const f = Math.min(1, value(c) / cap);
          tmp.push(L.circleMarker([c.lat, c.lon], { radius: 4 + Math.sqrt(f) * 14, color: '#fff', weight: 1, fillColor: color(f), fillOpacity: 0.8 }).bindTooltip(tipFor(c)).addTo(map));
        });
        markers.push(...tmp.reverse());
      }
      markersRef.current = markers;
      const pts = rows.map((c) => [c.lat, c.lon] as [number, number]);
      const fit = () => {
        map.invalidateSize();
        if (pts.length) map.fitBounds(pts, { padding: [20, 20] });
        else map.setView([31.9, 34.9], 8);
      };
      fit();
      setTimeout(() => !disposed && fit(), 200);
    })();
    return () => {
      disposed = true;
    };
  }, [data, rows, mode, value, tipFor]);

  useEffect(
    () => () => {
      mapRef.current?.remove();
      mapRef.current = null;
    },
    []
  );

  const focus = (i: number) => {
    const c = rows[i];
    const map = mapRef.current;
    if (!c || !map) return;
    map.setView([c.lat, c.lon], 14);
    setTimeout(() => {
      const m = markersRef.current[i];
      if (m && map.hasLayer(m)) m.openTooltip();
    }, 400);
  };

  const preset = (days: number) => {
    setFrom(addDays(to, -(days - 1)));
  };
  const T = data?.totals;
  const tooLong = (Date.parse(to) - Date.parse(from)) / 86400000 + 1 > MAX_DAYS || to < from;
  const hasMap = !!data && rows.length > 0;

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('heat.title', language)}
        subtitle={data ? t('heat.sub', language).replace('{from}', dm(data.from)).replace('{to}', dm(data.to)).replace('{days}', String(data.workDays)) : undefined}
        actions={
          <>
            <PeriodDate label={t('heat.from', language)} value={from} onChange={setFrom} />
            <PeriodDate label={t('heat.to', language)} value={to} onChange={setTo} />
            <div className={SEGMENT}>
              {[7, 30, 90].map((n) => (
                <button key={n} type="button" onClick={() => preset(n)} className={segButton(false)}>
                  {t('heat.days_n', language).replace('{n}', String(n))}
                </button>
              ))}
            </div>
            <Button variant="primary" onClick={load} disabled={tooLong} loading={loading}>
              {loading ? t('heat.loading_btn', language) : t('heat.show', language)}
            </Button>
          </>
        }
      />

      {tooLong && <Alert tone="warning">{t('heat.too_long', language).replace('{n}', String(MAX_DAYS))}</Alert>}
      {error && <Alert tone="danger">{error}</Alert>}

      {loading && !data && (
        <div className="space-y-5" role="status">
          <p className="flex items-center gap-2 text-sm text-ink-muted">
            <Loader2 className="size-4 animate-spin text-ink-subtle" aria-hidden />
            {t('heat.loading', language)}
          </p>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-[92px] rounded-lg" />
            ))}
          </div>
          <Skeleton className="h-[500px] rounded-lg" />
        </div>
      )}

      {data && T && (
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <Stat label={t('heat.t_customers', language)} icon={<Users />} value={nf.format(T.customers)} />
          <Stat
            label={t('heat.t_visits', language)}
            icon={<MapPin />}
            value={nf.format(T.visits)}
            hint={t('heat.t_visits_sub', language).replace('{p}', String(T.visits ? Math.round((T.reportedVisits / T.visits) * 100) : 0))}
          />
          <Stat label={t('heat.t_kg', language)} icon={<Weight />} value={`${nf.format(Math.round(T.kg / 100) / 10)} ${t('heat.ton', language)}`} />
          <Stat label={t('heat.t_days', language)} icon={<CalendarDays />} value={String(data.workDays)} />
        </div>
      )}

      {/* The map element stays mounted so Leaflet always has its container; it has no height until there are customers to show. */}
      <Card className={cn(!data && 'hidden')}>
        {data && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-4 py-2.5 text-[13px] text-ink-muted">
            <span>{t('heat.showing', language)}</span>
            <div className={SEGMENT}>
              <button type="button" aria-pressed={metric === 'visits'} onClick={() => setMetric('visits')} className={segButton(metric === 'visits')}>
                {t('heat.m_visits', language)}
              </button>
              <button type="button" aria-pressed={metric === 'kg'} onClick={() => setMetric('kg')} className={segButton(metric === 'kg')}>
                {t('heat.m_kg', language)}
              </button>
            </div>
            <div className={SEGMENT}>
              <button type="button" aria-pressed={mode === 'heat'} onClick={() => setMode('heat')} className={segButton(mode === 'heat')}>
                {t('heat.mode_heat', language)}
              </button>
              <button type="button" aria-pressed={mode === 'dots'} onClick={() => setMode('dots')} className={segButton(mode === 'dots')}>
                {t('heat.mode_dots', language)}
              </button>
            </div>
            <label className="inline-flex cursor-pointer items-center gap-2 text-ink">
              <input type="checkbox" checked={reportedOnly} onChange={(e) => setReportedOnly(e.target.checked)} className="size-4 cursor-pointer accent-primary" />
              {t('heat.reported', language)}
            </label>
            <span className="ms-auto inline-flex items-center gap-2 text-xs text-ink-subtle">
              {t('heat.low', language)}
              <span className="h-2 w-[90px] rounded-full bg-[linear-gradient(90deg,#2b83ba,#abdda4,#ffffbf,#fdae61,#d7191c)]" aria-hidden />
              {t('heat.high', language)}
            </span>
          </div>
        )}
        <div className={cn(hasMap && 'p-3')}>
          <div ref={mapEl} dir="ltr" className={cn('overflow-hidden rounded', hasMap && 'border border-line')} style={{ height: hasMap ? 500 : 0 }} />
        </div>
        {data && !rows.length && <EmptyState icon={<Route />} title={t('heat.no_data', language)} />}
        {(tilesFailed || !!T?.withoutCoordinates) && (
          <div className="space-y-1 px-4 pb-3 text-xs text-ink-subtle">
            {tilesFailed && <p>{t('map.tiles_failed', language)}</p>}
            {!!T?.withoutCoordinates && <p>{t('heat.missing', language).replace('{n}', String(T.withoutCoordinates))}</p>}
          </div>
        )}
      </Card>

      {hasMap && (
        <Card className="overflow-hidden">
          <CardHeader title={t('heat.top', language).replace('{n}', String(Math.min(TOP, rows.length)))} />
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-line bg-surface-muted">
                  {['#', 'heat.c_cust', 'heat.c_city', 'heat.c_visits', 'heat.c_kg', 'heat.c_days', 'heat.c_routes'].map((k) => (
                    <th key={k} scope="col" className={TH}>
                      {k === '#' ? '#' : t(k, language)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, TOP).map((c, i) => (
                  <tr
                    key={c.id}
                    tabIndex={0}
                    onClick={() => focus(i)}
                    onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), focus(i))}
                    className="cursor-pointer border-b border-line last:border-0 hover:bg-surface-hover focus-visible:bg-surface-selected focus-visible:outline-none"
                  >
                    <td className={cn(TD, 'text-ink-subtle tabular')}>{i + 1}</td>
                    <td className={cn(TD, 'min-w-[180px] text-ink')}>
                      <span className="sensitive">{c.name}</span>
                    </td>
                    <td className={cn(TD, 'text-ink-muted')}>{c.city}</td>
                    <td className={cn(TD, 'tabular', metric === 'visits' ? 'font-semibold text-ink' : 'text-ink-muted')}>{nf.format(reportedOnly ? c.reportedVisits : c.visits)}</td>
                    <td className={cn(TD, 'tabular', metric === 'kg' ? 'font-semibold text-ink' : 'text-ink-muted')}>{nf.format(reportedOnly ? c.reportedKg : c.kg)}</td>
                    <td className={cn(TD, 'text-ink tabular')}>{c.days}</td>
                    <td className={cn(TD, 'max-w-[16rem] truncate text-ink-subtle tabular')}>{c.routes.slice(0, 4).join(', ') + (c.routes.length > 4 ? '…' : '')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="border-t border-line px-4 py-3 text-xs text-ink-subtle">{t('heat.foot', language)}</p>
        </Card>
      )}
    </div>
  );
}
