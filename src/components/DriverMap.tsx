'use client';

// Where was the driver when he reported arrival and departure at each customer?
// Street map (Leaflet + OpenStreetMap) of the truck GPS track with the report positions, next to
// each customer's location. Data: /api/positions (route actuals + equipment positions).
import 'leaflet/dist/leaflet.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Map as LeafletMap } from 'leaflet';
import { useLanguage } from '@/context/LanguageContext';
import DateInput from '@/components/DateInput';
import { t } from '@/i18n/translations';
import type { DriverPositions, EventType } from '@/lib/driverPositions';

const TIME_ZONE = 'Asia/Jerusalem';
const COLOR: Record<EventType, string> = { arrival: '#2f6fde', delivered: '#1e8a4c', departure: '#c76a0a' };
const TILE_SOURCES: [string, string][] = [
  ['https://tile.openstreetmap.org/{z}/{x}/{y}.png', '&copy; OpenStreetMap'],
  ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', 'Tiles &copy; Esri'],
];

type RouteItem = { routeId: string; driverName: string; vehicle: string; reported: boolean };

const escHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export default function DriverMap({ sessionDate, onDateChange }: { sessionDate: string; onDateChange: (d: string) => void }) {
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
  const align = isRTL ? 'right' : 'left';

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
      const useSource = (k: number) => {
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
          if (k + 1 < TILE_SOURCES.length) useSource(k + 1);
          else setTilesFailed(true);
        });
        layer.addTo(map);
      };
      useSource(0);

      const bounds: [number, number][] = [];
      if (data.track.length) {
        const pts = data.track.map((p) => [p[0], p[1]] as [number, number]);
        L.polyline(pts, { color: '#8d8a83', weight: 3, opacity: 0.7 }).addTo(map);
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
            .bindTooltip(`<b>#${s.sequence} ${escHtml(s.customer)}</b>${s.city ? '<br>' + escHtml(s.city) : ''}`)
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
              `<b>${escHtml(label(e.type))} ${hm(e.time)}</b> · #${s.sequence} ${escHtml(s.customer)}` +
                (e.orderId ? `<br>${escHtml(t('map.order', language))} ${escHtml(e.orderId)}` : '') +
                (e.distanceM != null ? `<br><span style="color:${far ? '#b42318' : 'inherit'}">${escHtml(dist(e.distanceM))} ${escHtml(t('map.from_customer', language))}</span>` : '') +
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

  const tile = (k: string, v: string, color?: string, sub?: string) => (
    <div style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-primary)', borderRadius: 8, padding: 16, textAlign: align }}>
      <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginBottom: 6 }}>{k}</div>
      <div style={{ color: color || 'var(--text-primary)', fontSize: 26, fontWeight: 700, lineHeight: 1.1 }}>{v}</div>
      {sub && <div style={{ color: 'var(--text-tertiary)', fontSize: 12, marginTop: 4 }}>{sub}</div>}
    </div>
  );

  const card: React.CSSProperties = { backgroundColor: 'var(--bg-secondary)', borderRadius: 6, border: '1px solid var(--border-primary)', padding: 24, marginBottom: 24 };
  const S = data?.summary;
  const notes: string[] = [];
  if (data && !data.track.length) notes.push(t('map.no_track', language));
  if (data && !data.summary.events) notes.push(t('map.no_events', language));

  const cell = (i: number, type: EventType) => {
    const evs = data!.stops[i].events.filter((e) => e.type === type);
    if (!evs.length) return <td style={{ padding: 8, color: 'var(--text-tertiary)' }}>—</td>;
    return (
      <td style={{ padding: 8, whiteSpace: 'nowrap' }}>
        {evs.map((e, k) => (
          <div key={k}>
            <b>{hm(e.time)}</b>
            {e.orderId && <span style={{ color: 'var(--text-tertiary)' }}> {e.orderId}</span>}
            <br />
            {e.distanceM == null ? (
              <span style={{ color: 'var(--text-tertiary)' }}>{t('map.no_gps', language)}</span>
            ) : (
              <span style={{ color: e.distanceM > data!.farThresholdM ? '#dc2626' : 'var(--text-secondary)', fontWeight: e.distanceM > data!.farThresholdM ? 700 : 400 }}>
                {dist(e.distanceM)} {t('map.from_customer', language)}
              </span>
            )}
          </div>
        ))}
      </td>
    );
  };

  return (
    <div>
      <style>{`.dm-num{display:flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:#1f1e1b;color:#fff;font:700 11px/1 system-ui,sans-serif;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.4)}.dm-depot{width:18px;height:18px;border-radius:4px;background:#1f1e1b;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.4)}.leaflet-tooltip{direction:${isRTL ? 'rtl' : 'ltr'};text-align:${align}}`}</style>
      <div style={card}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 20, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>{t('map.title', language)}</h2>
          <span style={{ flex: 1 }} />
          <label style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
            {t('map.date', language)}{' '}
            <DateInput value={sessionDate} onChange={onDateChange} style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border-primary)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }} />
          </label>
          <label style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
            {t('map.route', language)}{' '}
            <select value={routeId} onChange={(e) => setRouteId(e.target.value)} style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border-primary)', background: 'var(--bg-primary)', color: 'var(--text-primary)', minWidth: 200 }}>
              <option value="">{t('map.choose', language)}</option>
              {routes.map((r) => (
                <option key={r.routeId} value={r.routeId}>
                  {r.routeId} · {r.driverName}
                  {r.reported ? '' : ` (${t('map.not_reported', language)})`}
                </option>
              ))}
            </select>
          </label>
          <button onClick={load} disabled={loading || !routeId} style={{ padding: '7px 14px', borderRadius: 6, border: '1px solid var(--border-primary)', background: 'transparent', color: 'var(--text-primary)', cursor: 'pointer' }}>
            {loading ? t('pva.refreshing', language) : t('pva.refresh', language)}
          </button>
        </div>
        {error && <div style={{ color: '#dc2626', marginBottom: 12 }}>{error}</div>}
        {!routeId && !error && <div style={{ color: 'var(--text-secondary)' }}>{t('map.choose_hint', language)}</div>}
        {loading && !data && <div style={{ color: 'var(--text-secondary)' }}>{t('map.loading', language)}</div>}
        {data && S && (
          <>
            <div style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 12, textAlign: align }}>
              {t('map.route', language)} {data.routeId} · {data.driverName}
              {data.vehicle ? ` · ${data.vehicle}` : ''}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 16 }}>
              {tile(t('map.events', language), String(S.events))}
              {tile(t('map.with_gps', language), `${S.withGps}/${S.events}`)}
              {tile(t('map.far', language), String(S.far), S.far ? '#dc2626' : '#16a34a', t('map.far_sub', language).replace('{m}', String(data.farThresholdM)))}
            </div>
            {notes.map((n) => (
              <div key={n} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-primary)', borderRadius: 6, padding: '8px 12px', marginBottom: 8, color: 'var(--text-secondary)', fontSize: 13 }}>
                ℹ️ {n}
              </div>
            ))}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, fontSize: 12, color: 'var(--text-secondary)', margin: '8px 0' }}>
              {(['arrival', 'departure'] as EventType[]).map((k) => (
                <span key={k}>
                  <i style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: COLOR[k], marginInlineEnd: 5 }} />
                  {label(k)}
                </span>
              ))}
              <span>
                <i style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: '#1f1e1b', marginInlineEnd: 5 }} />
                {t('map.customer', language)}
              </span>
              <span>
                <i style={{ display: 'inline-block', width: 14, height: 3, background: '#8d8a83', marginInlineEnd: 5, verticalAlign: 'middle' }} />
                {t('map.track', language)}
              </span>
            </div>
          </>
        )}
        <div ref={mapEl} style={{ height: data ? 480 : 0, borderRadius: 8, border: data ? '1px solid var(--border-primary)' : 'none', direction: 'ltr', overflow: 'hidden' }} />
        {tilesFailed && <div style={{ color: 'var(--text-tertiary)', fontSize: 12, marginTop: 6 }}>{t('map.tiles_failed', language)}</div>}
      </div>

      {data && (
        <div style={card}>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginTop: 0, textAlign: align }}>{t('map.list', language)}</h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, color: 'var(--text-primary)' }}>
              <thead>
                <tr style={{ color: 'var(--text-secondary)', textAlign: align }}>
                  <th style={{ padding: 8, textAlign: align }}>#</th>
                  <th style={{ padding: 8, textAlign: align }}>{t('map.customer_col', language)}</th>
                  <th style={{ padding: 8, textAlign: align }}>{label('arrival')}</th>
                  <th style={{ padding: 8, textAlign: align }}>{label('departure')}</th>
                </tr>
              </thead>
              <tbody>
                {data.stops.map((s, i) => (
                  <tr
                    key={i}
                    onClick={() => setSelected(i)}
                    style={{ borderTop: '1px solid var(--border-primary)', cursor: 'pointer', background: selected === i ? 'rgba(47,111,222,.12)' : undefined, textAlign: align }}
                  >
                    <td style={{ padding: 8 }}>{s.sequence}</td>
                    <td style={{ padding: 8, minWidth: 180 }}>
                      {s.customer}
                      {s.city && <div style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>{s.city}</div>}
                    </td>
                    {cell(i, 'arrival')}
                    {cell(i, 'departure')}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ color: 'var(--text-tertiary)', fontSize: 12, marginTop: 10, textAlign: align }}>{t('map.foot', language)}</div>
        </div>
      )}
    </div>
  );
}
