// Customer heat map: where the customers are and how much they get over a period.
// One row per customer location with planned visits / planned weight, plus the share of those
// visits where the driver actually reported arrival (so the view can switch to "reported only").
// Source: /reports/routeactuals for the period (planned stops + field events + planned quantities).
// Actual quantities are not reported at Harash, so weight is the planned delivery quantity.
// Ported from roadnet-plugin src/heatmap.ts so the dashboard and the Chat plugin agree.

export interface HeatCustomer {
  id: string;
  name: string;
  city: string;
  lat: number;
  lon: number;
  /** Stops in the plan for this customer (one stop = one visit). */
  visits: number;
  /** Visits where the driver reported arrival (a real field event). */
  reportedVisits: number;
  /** Planned weight (kg) over all visits / over reported visits. */
  kg: number;
  reportedKg: number;
  /** Distinct days with a visit. */
  days: number;
  lastVisit: string;
  routes: string[];
}

export interface CustomerHeat {
  view: 'heatmap';
  from: string;
  to: string;
  workDays: number;
  totals: { customers: number; visits: number; reportedVisits: number; kg: number; reportedKg: number; withoutCoordinates: number };
  customers: HeatCustomer[];
}

export const MAX_HEAT_DAYS = 92;
const isReal = (v: any) => !!v?.value && v.dataSource !== 'Projected' && v.dataSource !== 'AssumedFromProjection';

export function daysBetween(from: string, to: string): number {
  const a = Date.parse(from + 'T00:00:00Z');
  const b = Date.parse(to + 'T00:00:00Z');
  return Math.round((b - a) / 86400000) + 1;
}

/** Split [from, to] into chunks of at most `size` days (inclusive dates). */
export function chunks(from: string, to: string, size = 31): [string, string][] {
  const out: [string, string][] = [];
  let a = Date.parse(from + 'T00:00:00Z');
  const end = Date.parse(to + 'T00:00:00Z');
  while (a <= end) {
    const b = Math.min(a + (size - 1) * 86400000, end);
    out.push([new Date(a).toISOString().slice(0, 10), new Date(b).toISOString().slice(0, 10)]);
    a = b + 86400000;
  }
  return out;
}

export function buildCustomerHeat(routes: any[], from: string, to: string): CustomerHeat {
  const map = new Map<string, HeatCustomer & { _days: Set<string>; _routes: Set<string> }>();
  const workDays = new Set<string>();
  let withoutCoordinates = 0;
  for (const r of routes) {
    const date: string = r.sessionIdentity?.date || '';
    if (!date || date < from || date > to) continue;
    workDays.add(date);
    for (const s of r.stopActuals || []) {
      if (s.stopType !== 'ServiceableStop') continue;
      const i = s.serviceableStopInfo || {};
      const loc = i.locationInfo || {};
      const lat = loc.coordinate?.latitude;
      const lon = loc.coordinate?.longitude;
      if (typeof lat !== 'number' || typeof lon !== 'number' || (lat === 0 && lon === 0)) {
        withoutCoordinates++;
        continue;
      }
      const id = loc.identity?.identifier || `${lat.toFixed(5)},${lon.toFixed(5)}`;
      let c = map.get(id);
      if (!c) {
        c = {
          id,
          name: (loc.description || '').trim(),
          city: (loc.address?.stateOrProvince || '').trim(),
          lat,
          lon,
          visits: 0,
          reportedVisits: 0,
          kg: 0,
          reportedKg: 0,
          days: 0,
          lastVisit: date,
          routes: [],
          _days: new Set(),
          _routes: new Set(),
        };
        map.set(id, c);
      }
      const kg = Array.isArray(i.plannedQuantities) ? Number(i.plannedQuantities[0]) || 0 : 0;
      const reported = isReal(i.arrivalTimestamp);
      c.visits++;
      c.kg += kg;
      if (reported) {
        c.reportedVisits++;
        c.reportedKg += kg;
      }
      c._days.add(date);
      if (r.identity?.identifier) c._routes.add(r.identity.identifier);
      if (date > c.lastVisit) c.lastVisit = date;
    }
  }
  const customers: HeatCustomer[] = [...map.values()]
    .map(({ _days, _routes, ...c }) => ({ ...c, kg: Math.round(c.kg), reportedKg: Math.round(c.reportedKg), days: _days.size, routes: [..._routes].sort() }))
    .sort((a, b) => b.visits - a.visits || b.kg - a.kg);
  const sum = (f: (c: HeatCustomer) => number) => customers.reduce((a, c) => a + f(c), 0);
  return {
    view: 'heatmap',
    from,
    to,
    workDays: workDays.size,
    totals: {
      customers: customers.length,
      visits: sum((c) => c.visits),
      reportedVisits: sum((c) => c.reportedVisits),
      kg: sum((c) => c.kg),
      reportedKg: sum((c) => c.reportedKg),
      withoutCoordinates,
    },
    customers,
  };
}
