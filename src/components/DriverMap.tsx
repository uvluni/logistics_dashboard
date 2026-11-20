'use client';

// Where was the driver when he reported arrival and departure at each customer?
// Street map (Leaflet + OpenStreetMap) of the truck GPS track with the report positions, next to
// each customer's location. Data: /api/positions (route actuals + equipment positions).
import 'leaflet/dist/leaflet.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Map as LeafletMap } from 'leaflet';
import { MapPin, MapPinned, Navigation, RefreshCw, Satellite } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import { t } from '@/i18n/translations';
import { LOCALE } from '@/i18n/messages';
import { formatLongDate } from '@/lib/dates';
import type { DriverPositions, EventType } from '@/lib/driverPositions';
import { PageHeader } from '@/components/layout/PageHeader';
import { IconButton } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Stat } from '@/components/ui/Stat';
import { Alert, EmptyState, Skeleton } from '@/components/ui/Feedback';
import { cn } from '@/components/ui/cn';

const TIME_ZONE = 'Asia/Jerusalem';
const COLOR: Record<EventType, string> = { arrival: '#2f6fde', delivered: '#1e8a4c', departure: '#c76a0a' };
// Customer / depot markers (brand navy) and the GPS track line, shared by the map and the legend.
const CUSTOMER_COLOR = '#043d5c';
const TRACK_COLOR = '#8d8a83';
const TILE_SOURCES: [string, string][] = [
  ['https://tile.openstreetmap.org/{z}/{x}/{y}.png', '&copy; OpenStreetMap'],
  ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', 'Tiles &copy; Esri'],
];
// Leaflet renders markers and tooltips outside React, so their classes are plain CSS.
const MARKER_CSS =
  `.dm-num{display:flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:${CUSTOMER_COLOR};color:#fff;font:700 11px/1 system-ui,sans-serif;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.4)}` +
  `.dm-depot{width:18px;height:18px;border-radius:4px;background:${CUSTOMER_COLOR};border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.4)}`;

const TH = 'h-10 whitespace-nowrap px-3 text-start text-[13px] font-medium text-ink-muted';
const TD = 'px-3 py-2.5 align-top';

type RouteItem = { routeId: string; driverName: string; vehicle: string; reported: boolean };

const escHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

// onDateChange is still passed by AppShell; the date itself is now picked in the top bar.
export default function DriverMap({ sessionDate, onDateChange: _onDateChange }: { sessionDate: string; onDateChange: (d: string) => void }) {
  const { language, isRTL } = useLanguage();
  const [routes, setRoutes] = useState<RouteItem[]>([]);
  const [routeId, setRouteId] = useState('');
  const [data, setData] = useState<DriverPositions | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [tilesFailed, setTilesFailed] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const mapEl = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const stopBounds = useRef<[number, number][][]>([]);

  const fmt = useMemo(() => new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit', hour12: false }), []);
  const hm = (ms: number) => fmt.format(ms);
  const dist = (m: number | null) => (m == null ? '' : m >= 1000 ? `${(Math.round(m / 100) / 10).toLocaleString()} ${t('map.km', language)}` : `${Math.round(m)} ${t('map.m', language)}`);
  const label = (type: EventType) => t(`map.${type}`, language);

  // Routes of the day for the picker.
  useEffect(() => {
    if (!sessionDate) return;
    let cancelled = false;
    setRoutes([]);
    setData(null);
    setError('');
    fetch(`/api/positions?sessionDate=${sessionDate}`, { credentials: 'include', cache: 'no-store' })
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
        if (cancelled) return;
        setRoutes(body.routes);
        setRouteId((cur) => (body.routes.some((r: RouteItem) => r.routeId === cur) ? cur : body.routes.find((r: RouteItem) => r.reported)?.routeId || ''));
      })
      .catch((e) => !cancelled && setError(`${t('map.load_error', language)}: ${e.message}`));
    return () => {
      cancelled = true;
    };
  }, [sessionDate, language]);

  const load = useCallback(async () => {
    if (!sessionDate || !routeId) return;
    setLoading(true);
    setError('');
    setSelected(null);
    try {
      const res = await fetch(`/api/positions?sessionDate=${sessionDate}&routeId=${encodeURIComponent(routeId)}`, { credentials: 'include', cache: 'no-store' });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      setData(body);
    } catch (e: any) {
      setData(null);
      setError(`${t('map.load_error', language)}: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }, [sessionDate, routeId, language]);

  useEffect(() => {
    load();
  }, [load]);

  // Draw the map whenever the data changes (Leaflet is loaded on the client only).
  useEffect(() => {
    if (!data || !mapEl.current) return;
    let disposed = false;
    (async () => {
      const L = (await import('leaflet')).default;
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

      const bounds: [number, number][] = [];
      if (data.track.length) {
        const pts = data.track.map((p) => [p[0], p[1]] as [number, number]);
        L.polyline(pts, { color: TRACK_COLOR, weight: 3, opacity: 0.7 }).addTo(map);
        bounds.push(...pts);
      }
      if (data.depot.lat != null && data.depot.lon != null) {
        L.marker([data.depot.lat, data.depot.lon], { icon: L.divIcon({ className: '', html: '<div class="dm-depot"></div>', iconSize: [18, 18] }) })
          .bindTooltip(escHtml(t('map.depot', language) + (data.depot.name ? ': ' + data.depot.name : '')))
          .addTo(map);
      }
      stopBounds.current = [];
      data.stops.forEach((s, i) => {
        const group: [number, number][] = [];
        if (s.lat != null && s.lon != null) {
          L.marker([s.lat, s.lon], { icon: L.divIcon({ className: '', html: `<div class="dm-num">${s.sequence}</div>`, iconSize: [22, 22] }), zIndexOffset: 500 })
            .bindTooltip(`<b>#${s.sequence} <span class="sensitive">${escHtml(s.customer)}</span></b>${s.city ? '<br>' + escHtml(s.city) : ''}`)
            .on('click', () => setSelected(i))
            .addTo(map);
          group.push([s.lat, s.lon]);
          bounds.push([s.lat, s.lon]);
        }
        s.events.forEach((e) => {
          if (e.lat == null || e.lon == null) return;
          const far = e.distanceM != null && e.distanceM > data.farThresholdM;
          if (far && s.lat != null && s.lon != null) {
            L.polyline([[e.lat, e.lon], [s.lat, s.lon]], { color: COLOR[e.type], weight: 2, dashArray: '5 5', opacity: 0.9 }).addTo(map);
          }
          L.circleMarker([e.lat, e.lon], { radius: far ? 8 : 6, color: '#fff', weight: 2, fillColor: COLOR[e.type], fillOpacity: 1 })
            .bindTooltip(
              `<b>${escHtml(label(e.type))} ${hm(e.time)}</b> · #${s.sequence} <span class="sensitive">${escHtml(s.customer)}</span>` +
                (e.orderId ? `<br>${escHtml(t('map.order', language))} ${escHtml(e.orderId)}` : '') +
                (e.distanceM != null ? `<br><span style="color:${far ? 'var(--danger)' : 'inherit'}">${escHtml(dist(e.distanceM))} ${escHtml(t('map.from_customer', language))}</span>` : '') +
                (e.gpsOffsetSec != null ? `<br><span style="opacity:.7">${escHtml(t('map.gps_off', language).replace('{s}', String(e.gpsOffsetSec)))}</span>` : '')
            )
            .on('click', () => setSelected(i))
            .addTo(map);
          group.push([e.lat, e.lon]);
          bounds.push([e.lat, e.lon]);
        });
        stopBounds.current[i] = group;
      });
      const fit = () => {
        map.invalidateSize();
        if (bounds.length) map.fitBounds(bounds, { padding: [24, 24] });
        else map.setView([31.9, 34.9], 8);
      };
      fit();
      setTimeout(() => !disposed && fit(), 200);
    })();
    return () => {
      disposed = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  useEffect(() => () => {
    mapRef.current?.remove();
    mapRef.current = null;
  }, []);

  useEffect(() => {
    if (selected == null || !mapRef.current) return;
    const g = stopBounds.current[selected];
    if (g && g.length) mapRef.current.fitBounds(g, { padding: [40, 40], maxZoom: 17 });
  }, [selected]);

  const S = data?.summary;
  const notes: string[] = [];
  if (data && !data.track.length) notes.push(t('map.no_track', language));
  if (data && !data.summary.events) notes.push(t('map.no_events', language));

  const cell = (i: number, type: EventType) => {
    const evs = data!.stops[i].events.filter((e) => e.type === type);
    if (!evs.length) return <td className={cn(TD, 'text-ink-subtle')}>—</td>;
    return (
      <td className={cn(TD, 'whitespace-nowrap')}>
        <div className="space-y-1.5">
          {evs.map((e, k) => {
            const far = e.distanceM != null && e.distanceM > data!.farThresholdM;
            return (
              <div key={k}>
                <span className="font-semibold text-ink tabular">{hm(e.time)}</span>
                {e.orderId && <span className="ms-1.5 text-xs text-ink-subtle tabular">{e.orderId}</span>}
                <div className="text-xs">
                  {e.distanceM == null ? (
                    <span className="text-ink-subtle">{t('map.no_gps', language)}</span>
                  ) : (
                    <span className={far ? 'font-semibold text-danger' : 'text-ink-muted'}>
                      {dist(e.distanceM)} {t('map.from_customer', language)}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </td>
    );
  };

  const legendDot = (color: string, text: string) => (
    <span className="inline-flex items-center gap-1.5">
      <span className="size-2.5 shrink-0 rounded-full ring-1 ring-surface" style={{ backgroundColor: color }} aria-hidden />
      {text}
    </span>
  );

  return (
    <div className="space-y-5">
      <style>{`${MARKER_CSS}.leaflet-tooltip{direction:${isRTL ? 'rtl' : 'ltr'};text-align:${isRTL ? 'right' : 'left'}}`}</style>

      <PageHeader
        title={t('map.title', language)}
        subtitle={
          data ? (
            <>
              {t('map.route', language)} <span className="tabular">{data.routeId}</span> · <span className="sensitive">{data.driverName}</span>
              {data.vehicle ? ` · ${data.vehicle}` : ''}
            </>
          ) : sessionDate ? (
            formatLongDate(sessionDate, LOCALE[language])
          ) : undefined
        }
        actions={
          <>
            <label className="flex items-center gap-2 text-[13px] text-ink-muted">
              {t('map.route', language)}
              <select
                value={routeId}
                onChange={(e) => setRouteId(e.target.value)}
                className="h-9 min-w-[220px] max-w-full rounded border border-line bg-surface px-2.5 text-[13px] text-ink shadow-sm hover:border-line-strong focus:border-accent focus:outline-none focus:ring-2 focus:ring-focus"
              >
                <option value="">{t('map.choose', language)}</option>
                {routes.map((r) => (
                  <option key={r.routeId} value={r.routeId}>
                    {r.routeId} · {r.driverName}
                    {r.reported ? '' : ` (${t('map.not_reported', language)})`}
                  </option>
                ))}
              </select>
            </label>
            <IconButton
              variant="secondary"
              label={loading ? t('pva.refreshing', language) : t('pva.refresh', language)}
              icon={<RefreshCw className={loading ? 'animate-spin' : undefined} />}
              onClick={load}
              disabled={loading || !routeId}
            />
          </>
        }
      />

      {error && <Alert tone="danger">{error}</Alert>}

      {!routeId && !error && (
        <Card>
          <EmptyState icon={<MapPinned />} title={t('map.choose', language)} hint={t('map.choose_hint', language)} />
        </Card>
      )}

      {loading && !data && (
        <div className="space-y-5" role="status" aria-label={t('map.loading', language)}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-[92px] rounded-lg" />
            ))}
          </div>
          <Skeleton className="h-[480px] rounded-lg" />
          <span className="sr-only">{t('map.loading', language)}</span>
        </div>
      )}

      {data && S && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Stat label={t('map.events', language)} icon={<Navigation />} value={String(S.events)} />
            <Stat label={t('map.with_gps', language)} icon={<Satellite />} value={`${S.withGps}/${S.events}`} />
            <Stat
              label={t('map.far', language)}
              icon={<MapPin />}
              value={String(S.far)}
              tone={S.far ? 'danger' : 'success'}
              hint={t('map.far_sub', language).replace('{m}', String(data.farThresholdM))}
            />
          </div>
          {notes.map((n) => (
            <Alert key={n} tone="info">
              {n}
            </Alert>
          ))}
        </>
      )}

      {/* The map element stays mounted so Leaflet always has its container; it has no height until there is data. */}
      <Card className={cn(!data && 'hidden')}>
        {data && (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 border-b border-line px-4 py-2.5 text-xs text-ink-muted">
            {(['arrival', 'departure'] as EventType[]).map((k) => (
              <span key={k}>{legendDot(COLOR[k], label(k))}</span>
            ))}
            {legendDot(CUSTOMER_COLOR, t('map.customer', language))}
            <span className="inline-flex items-center gap-1.5">
              <span className="h-[3px] w-3.5 shrink-0 rounded-full" style={{ backgroundColor: TRACK_COLOR }} aria-hidden />
              {t('map.track', language)}
            </span>
          </div>
        )}
        <div className="p-3">
          <div ref={mapEl} dir="ltr" className={cn('overflow-hidden rounded', data && 'border border-line')} style={{ height: data ? 480 : 0 }} />
          {tilesFailed && <p className="mt-2 text-xs text-ink-subtle">{t('map.tiles_failed', language)}</p>}
        </div>
      </Card>

      {data && (
        <Card className="overflow-hidden">
          <CardHeader title={t('map.list', language)} count={data.stops.length} />
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-line bg-surface-muted">
                  <th scope="col" className={TH}>#</th>
                  <th scope="col" className={TH}>{t('map.customer_col', language)}</th>
                  <th scope="col" className={TH}>{label('arrival')}</th>
                  <th scope="col" className={TH}>{label('departure')}</th>
                </tr>
              </thead>
              <tbody>
                {data.stops.map((s, i) => (
                  <tr
                    key={i}
                    tabIndex={0}
                    onClick={() => setSelected(i)}
                    onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setSelected(i))}
                    aria-selected={selected === i}
                    className={cn(
                      'cursor-pointer border-b border-line last:border-0 focus-visible:bg-surface-selected focus-visible:outline-none',
                      selected === i ? 'bg-surface-selected' : 'hover:bg-surface-hover'
                    )}
                  >
                    <td className={cn(TD, 'font-semibold text-ink tabular')}>{s.sequence}</td>
                    <td className={cn(TD, 'min-w-[180px] text-ink')}>
                      <span className="sensitive">{s.customer}</span>
                      {s.city && <div className="text-xs text-ink-subtle">{s.city}</div>}
                    </td>
                    {cell(i, 'arrival')}
                    {cell(i, 'departure')}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="border-t border-line px-4 py-3 text-xs text-ink-subtle">{t('map.foot', language)}</p>
        </Card>
      )}
    </div>
  );
}
