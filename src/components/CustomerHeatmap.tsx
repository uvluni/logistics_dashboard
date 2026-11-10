'use client';

// Customer heat map: where the customers are and how many visits / how much planned weight they
// get over a period. Leaflet + leaflet.heat on OpenStreetMap (Esri fallback). Data: /api/heatmap.
import 'leaflet/dist/leaflet.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Map as LeafletMap, CircleMarker } from 'leaflet';
import { useLanguage } from '@/context/LanguageContext';
import { t } from '@/i18n/translations';
import type { CustomerHeat, HeatCustomer } from '@/lib/customerHeat';

const TILE_SOURCES: [string, string][] = [
  ['https://tile.openstreetmap.org/{z}/{x}/{y}.png', '&copy; OpenStreetMap'],
  ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', 'Tiles &copy; Esri'],
];
const GRADIENT = { 0.2: '#2b83ba', 0.4: '#abdda4', 0.6: '#ffffbf', 0.8: '#fdae61', 1: '#d7191c' };
const TOP = 25;
const MAX_DAYS = 92;

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

export default function CustomerHeatmap({ sessionDate }: { sessionDate: string }) {
  const { language, isRTL } = useLanguage();
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
  const align = isRTL ? 'right' : 'left';
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
      `<b>${escHtml(c.name)}</b>${c.city ? '<br>' + escHtml(c.city) : ''}` +
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

      // Scale to the 95th percentile so one huge customer doesn't wash out the rest.
      const vals = rows.map(value).sort((a, b) => a - b);
      const cap = vals.length ? vals[Math.min(vals.length - 1, Math.floor(vals.length * 0.95))] || 1 : 1;
      const markers: CircleMarker[] = [];
      if (mode === 'heat') {
        (L as any).heatLayer(rows.map((c) => [c.lat, c.lon, Math.min(1, value(c) / cap)]), { radius: 22, blur: 18, maxZoom: 12, minOpacity: 0.35, gradient: GRADIENT }).addTo(map);
        const dots = L.layerGroup();
        rows.forEach((c) => markers.push(L.circleMarker([c.lat, c.lon], { radius: 5, color: '#fff', weight: 1, fillColor: '#1f1e1b', fillOpacity: 0.55 }).bindTooltip(tipFor(c)).addTo(dots)));
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
  const card: React.CSSProperties = { backgroundColor: 'var(--bg-secondary)', borderRadius: 6, border: '1px solid var(--border-primary)', padding: 24, marginBottom: 24 };
  const input: React.CSSProperties = { padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border-primary)', background: 'var(--bg-primary)', color: 'var(--text-primary)' };
  const btn = (on: boolean): React.CSSProperties => ({ padding: '6px 12px', border: '1px solid var(--border-primary)', background: on ? 'var(--color-blue)' : 'transparent', color: on ? 'white' : 'var(--text-secondary)', cursor: 'pointer', fontSize: 13 });
  const tile = (k: string, v: string, sub?: string) => (
    <div style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-primary)', borderRadius: 8, padding: 16, textAlign: align }}>
      <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginBottom: 6 }}>{k}</div>
      <div style={{ color: 'var(--text-primary)', fontSize: 26, fontWeight: 700, lineHeight: 1.1 }}>{v}</div>
      {sub && <div style={{ color: 'var(--text-tertiary)', fontSize: 12, marginTop: 4 }}>{sub}</div>}
    </div>
  );
  const T = data?.totals;
  const tooLong = (Date.parse(to) - Date.parse(from)) / 86400000 + 1 > MAX_DAYS || to < from;

  return (
    <div>
      <div style={card}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 20, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>{t('heat.title', language)}</h2>
          <span style={{ flex: 1 }} />
          <label style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
            {t('heat.from', language)} <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={input} />
          </label>
          <label style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
            {t('heat.to', language)} <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={input} />
          </label>
          <span style={{ display: 'inline-flex', borderRadius: 6, overflow: 'hidden' }}>
            {[7, 30, 90].map((n) => (
              <button key={n} onClick={() => preset(n)} style={btn(false)}>
                {t('heat.days_n', language).replace('{n}', String(n))}
              </button>
            ))}
          </span>
          <button onClick={load} disabled={loading || tooLong} style={{ ...btn(true), borderRadius: 6, opacity: loading || tooLong ? 0.6 : 1 }}>
            {loading ? t('heat.loading_btn', language) : t('heat.show', language)}
          </button>
        </div>
        {tooLong && <div style={{ color: '#dc2626', marginBottom: 12, fontSize: 13 }}>{t('heat.too_long', language).replace('{n}', String(MAX_DAYS))}</div>}
        {error && <div style={{ color: '#dc2626', marginBottom: 12 }}>{error}</div>}
        {loading && !data && <div style={{ color: 'var(--text-secondary)' }}>{t('heat.loading', language)}</div>}
        {data && T && (
          <>
            <div style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 12, textAlign: align }}>
              {t('heat.sub', language).replace('{from}', dm(data.from)).replace('{to}', dm(data.to)).replace('{days}', String(data.workDays))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 16 }}>
              {tile(t('heat.t_customers', language), nf.format(T.customers))}
              {tile(t('heat.t_visits', language), nf.format(T.visits), t('heat.t_visits_sub', language).replace('{p}', String(T.visits ? Math.round((T.reportedVisits / T.visits) * 100) : 0)))}
              {tile(t('heat.t_kg', language), `${nf.format(Math.round(T.kg / 100) / 10)} ${t('heat.ton', language)}`)}
              {tile(t('heat.t_days', language), String(data.workDays))}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginBottom: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
              <span>{t('heat.showing', language)}</span>
              <span style={{ display: 'inline-flex', borderRadius: 6, overflow: 'hidden' }}>
                <button onClick={() => setMetric('visits')} style={btn(metric === 'visits')}>{t('heat.m_visits', language)}</button>
                <button onClick={() => setMetric('kg')} style={btn(metric === 'kg')}>{t('heat.m_kg', language)}</button>
              </span>
              <span style={{ display: 'inline-flex', borderRadius: 6, overflow: 'hidden' }}>
                <button onClick={() => setMode('heat')} style={btn(mode === 'heat')}>{t('heat.mode_heat', language)}</button>
                <button onClick={() => setMode('dots')} style={btn(mode === 'dots')}>{t('heat.mode_dots', language)}</button>
              </span>
              <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
                <input type="checkbox" checked={reportedOnly} onChange={(e) => setReportedOnly(e.target.checked)} /> {t('heat.reported', language)}
              </label>
              <span style={{ flex: 1 }} />
              <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 11, color: 'var(--text-tertiary)' }}>
                {t('heat.low', language)}
                <i style={{ width: 90, height: 8, borderRadius: 4, background: 'linear-gradient(90deg,#2b83ba,#abdda4,#ffffbf,#fdae61,#d7191c)' }} />
                {t('heat.high', language)}
              </span>
            </div>
          </>
        )}
        <div ref={mapEl} style={{ height: data && rows.length ? 500 : 0, borderRadius: 8, border: data && rows.length ? '1px solid var(--border-primary)' : 'none', direction: 'ltr', overflow: 'hidden' }} />
        {data && !rows.length && <div style={{ color: 'var(--text-secondary)' }}>{t('heat.no_data', language)}</div>}
        {tilesFailed && <div style={{ color: 'var(--text-tertiary)', fontSize: 12, marginTop: 6 }}>{t('map.tiles_failed', language)}</div>}
        {!!T?.withoutCoordinates && <div style={{ color: 'var(--text-tertiary)', fontSize: 12, marginTop: 6 }}>{t('heat.missing', language).replace('{n}', String(T.withoutCoordinates))}</div>}
      </div>

      {data && rows.length > 0 && (
        <div style={card}>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginTop: 0, textAlign: align }}>{t('heat.top', language).replace('{n}', String(Math.min(TOP, rows.length)))}</h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, color: 'var(--text-primary)' }}>
              <thead>
                <tr style={{ color: 'var(--text-secondary)' }}>
                  {['#', 'heat.c_cust', 'heat.c_city', 'heat.c_visits', 'heat.c_kg', 'heat.c_days', 'heat.c_routes'].map((k) => (
                    <th key={k} style={{ padding: 8, textAlign: align }}>{k === '#' ? '#' : t(k, language)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, TOP).map((c, i) => (
                  <tr key={c.id} onClick={() => focus(i)} style={{ borderTop: '1px solid var(--border-primary)', cursor: 'pointer', textAlign: align }}>
                    <td style={{ padding: 8 }}>{i + 1}</td>
                    <td style={{ padding: 8, minWidth: 180 }}>{c.name}</td>
                    <td style={{ padding: 8 }}>{c.city}</td>
                    <td style={{ padding: 8, fontWeight: metric === 'visits' ? 700 : 400 }}>{nf.format(reportedOnly ? c.reportedVisits : c.visits)}</td>
                    <td style={{ padding: 8, fontWeight: metric === 'kg' ? 700 : 400 }}>{nf.format(reportedOnly ? c.reportedKg : c.kg)}</td>
                    <td style={{ padding: 8 }}>{c.days}</td>
                    <td style={{ padding: 8, color: 'var(--text-tertiary)' }}>{c.routes.slice(0, 4).join(', ') + (c.routes.length > 4 ? '…' : '')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ color: 'var(--text-tertiary)', fontSize: 12, marginTop: 10, textAlign: align }}>{t('heat.foot', language)}</div>
        </div>
      )}
    </div>
  );
}
