// Where was the driver when he reported arrival, delivery and departure at each customer?
// Event times come from route actuals (arrival/departure, field events only) and, when ROADNET
// records it, the SOAP QuantityInputTimestamp per order ("delivered"). Positions come from the
// truck's GPS track (/reports/equipmentpositions/{key}, about one fix a minute): the driver's
// position at an event is interpolated between the fixes around it.
// RNA timestamps carry no offset and are UTC; values here are epoch ms.
// Ported from roadnet-plugin src/positions.ts so the dashboard and the Chat plugin agree.

export type EventType = 'arrival' | 'delivered' | 'departure';

export interface DriverEvent {
  type: EventType;
  time: number;
  orderId?: string;
  lat: number | null;
  lon: number | null;
  /** Seconds between the event and the closest GPS fix used (null = no GPS near that time). */
  gpsOffsetSec: number | null;
  /** Straight-line distance from the customer's location, meters. */
  distanceM: number | null;
}

export interface PositionStop {
  sequence: number;
  locationId: string;
  customer: string;
  city: string;
  lat: number | null;
  lon: number | null;
  plannedArrival: number | null;
  orders: number;
  events: DriverEvent[];
}

export interface DriverPositions {
  view: 'positions';
  sessionDate: string;
  routeId: string;
  driverName: string;
  vehicle: string;
  depot: { name: string; lat: number | null; lon: number | null };
  /** GPS track, [lat, lon, epochMs], time-ordered. */
  track: [number, number, number][];
  stops: PositionStop[];
  farThresholdM: number;
  summary: { events: number; withGps: number; far: number; delivered: number };
  /** Why there are no "delivered" points, if there are none. */
  deliveredNote: string | null;
}

export const FAR_THRESHOLD_M = 300;
const MAX_GPS_GAP_MS = 5 * 60_000;

const parse = (v: any): number | null => {
  const s = typeof v === 'string' ? v : v?.value;
  if (!s) return null;
  const iso = /[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : s.replace(/(\.\d{3})\d*$/, '$1') + 'Z';
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
};
const isReal = (v: any) => !!v?.value && v.dataSource !== 'Projected' && v.dataSource !== 'AssumedFromProjection';
const utc = (ms: number) => new Date(ms).toISOString().slice(0, 19);

export function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const r = Math.PI / 180;
  const x = Math.sin(((lat2 - lat1) * r) / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lon2 - lon1) * r) / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(x)));
}

/** Driver position at time t: interpolated between the fixes around t, or the nearest fix within 5 minutes. */
export function positionAt(track: [number, number, number][], t: number): { lat: number; lon: number; offsetSec: number } | null {
  if (!track.length) return null;
  let lo = 0;
  let hi = track.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (track[mid][2] < t) lo = mid + 1;
    else hi = mid;
  }
  const after = track[lo];
  const before = lo > 0 ? track[lo - 1] : null;
  if (before && after[2] >= t && t - before[2] <= MAX_GPS_GAP_MS && after[2] - t <= MAX_GPS_GAP_MS && after[2] > before[2]) {
    const f = (t - before[2]) / (after[2] - before[2]);
    return {
      lat: before[0] + (after[0] - before[0]) * f,
      lon: before[1] + (after[1] - before[1]) * f,
      offsetSec: Math.round(Math.min(t - before[2], after[2] - t) / 1000),
    };
  }
  const near = [before, after].filter(Boolean).sort((a, b) => Math.abs(a![2] - t) - Math.abs(b![2] - t))[0]!;
  if (Math.abs(near[2] - t) > MAX_GPS_GAP_MS) return null;
  return { lat: near[0], lon: near[1], offsetSec: Math.round(Math.abs(near[2] - t) / 1000) };
}

/** Delivered timestamps per order (from SOAP), keyed by location id. */
export type DeliveredLookup = Map<string, { orderId: string; time: number }[]>;

export function buildPositions(
  r: any,
  rawPositions: any[],
  sessionDate: string,
  delivered: DeliveredLookup | null,
  deliveredNote: string | null
): DriverPositions {
  const track: [number, number, number][] = rawPositions
    .map((p) => [p.coordinate?.latitude, p.coordinate?.longitude, parse(p.timestamps?.deviceTimestamp)] as [number, number, number | null])
    .filter((p): p is [number, number, number] => typeof p[0] === 'number' && typeof p[1] === 'number' && p[2] != null && !(p[0] === 0 && p[1] === 0))
    .sort((a, b) => a[2] - b[2]);

  const all: any[] = r.stopActuals || [];
  const origin = all.find((s) => s.stopType === 'OriginDepotStop')?.originDepotStopInfo?.locationInfo;
  const stops: PositionStop[] = all
    .filter((s) => s.stopType === 'ServiceableStop')
    .map((s) => {
      const i = s.serviceableStopInfo || {};
      const lat = i.locationInfo?.coordinate?.latitude ?? null;
      const lon = i.locationInfo?.coordinate?.longitude ?? null;
      const locationId = i.locationInfo?.identity?.identifier || '';
      const event = (type: EventType, time: number, orderId?: string): DriverEvent => {
        const p = positionAt(track, time);
        return {
          type,
          time,
          ...(orderId ? { orderId } : {}),
          lat: p?.lat ?? null,
          lon: p?.lon ?? null,
          gpsOffsetSec: p?.offsetSec ?? null,
          distanceM: p && lat != null && lon != null ? haversineM(p.lat, p.lon, lat, lon) : null,
        };
      };
      const events: DriverEvent[] = [];
      const arr = isReal(i.arrivalTimestamp) ? parse(i.arrivalTimestamp) : null;
      const dep = isReal(i.departureTimestamp) ? parse(i.departureTimestamp) : null;
      if (arr != null) events.push(event('arrival', arr));
      for (const d of delivered?.get(locationId) || []) events.push(event('delivered', d.time, d.orderId));
      if (dep != null) events.push(event('departure', dep));
      events.sort((a, b) => a.time - b.time);
      return {
        sequence: s.plannedSequenceNormalized ?? s.sequence ?? 0,
        locationId,
        customer: (i.locationInfo?.description || '').trim(),
        city: (i.locationInfo?.address?.stateOrProvince || '').trim(),
        lat,
        lon,
        plannedArrival: parse(i.plannedArrivalTimestamp),
        orders: (i.orderActuals || []).length,
        events,
      };
    })
    .sort((a, b) => a.sequence - b.sequence)
    .map((s, idx) => ({ ...s, sequence: idx + 1 })); // 1..n like the route view (RNA numbering counts depots)

  const events = stops.flatMap((s) => s.events);
  return {
    view: 'positions',
    sessionDate,
    routeId: r.identity?.identifier || '',
    driverName: r.workersInfo?.[0]?.name?.firstName || '',
    vehicle: r.equipmentInfo?.[0]?.specificEquipmentInfo?.identity?.identifier || '',
    depot: { name: (origin?.description || '').trim(), lat: origin?.coordinate?.latitude ?? null, lon: origin?.coordinate?.longitude ?? null },
    track,
    stops,
    farThresholdM: FAR_THRESHOLD_M,
    summary: {
      events: events.length,
      withGps: events.filter((e) => e.lat != null).length,
      far: events.filter((e) => (e.distanceM ?? 0) > FAR_THRESHOLD_M).length,
      delivered: events.filter((e) => e.type === 'delivered').length,
    },
    deliveredNote: events.some((e) => e.type === 'delivered') ? null : deliveredNote,
  };
}

/** GPS window for a route: from an hour before it starts to an hour after its last event (capped at now). */
export function gpsWindow(r: any, now = Date.now()): { begin: string; end: string } {
  const all: any[] = r.stopActuals || [];
  const times = [
    parse(r.plannedTimestamps?.started),
    isReal(r.timestamps?.started) ? parse(r.timestamps.started) : null,
    ...all.flatMap((s) => {
      const i = s.serviceableStopInfo;
      return i ? [isReal(i.arrivalTimestamp) ? parse(i.arrivalTimestamp) : null, isReal(i.departureTimestamp) ? parse(i.departureTimestamp) : null] : [];
    }),
    isReal(r.timestamps?.completed) ? parse(r.timestamps.completed) : null,
  ].filter((t): t is number => t != null);
  const start = Math.min(...times);
  const end = Math.min(Math.max(...times) + 3600_000, now);
  return { begin: utc(start - 3600_000), end: utc(Math.max(end, start)) };
}
