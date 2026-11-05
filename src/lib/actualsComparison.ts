// Plan vs actual from ROADNET /v1/reports/routeactuals.
// Same logic as the roadnet Claude plugin (roadnet-plugin/.../server/src/actuals.ts).
// RNA timestamps carry no offset and are UTC; we return epoch ms and let the UI format.

export type ActualStatus = 'not_started' | 'not_started_overdue' | 'in_progress' | 'suspended' | 'completed';

export interface RouteActual {
  routeId: string;
  driverName: string;
  routeState: string;
  status: ActualStatus;
  plannedStart: number | null;
  actualStart: number | null;
  startDelayMinutes: number | null;
  plannedEnd: number | null;
  projectedEnd: number | null; // for an overdue route that hasn't left: plannedEnd + delay
  endDeviationMinutes: number | null;
  stopsPlanned: number;
  stopsDueByNow: number;
  stopsArrived: number;
  stopsCompleted: number;
  lastStopDelayMinutes: number | null;
}

export interface ActualsResponse {
  sessionDate: string;
  asOf: number;
  lastDataCapturedAt: number | null;
  totals: {
    routes: number;
    started: number;
    notStartedOverdue: number;
    suspended: number;
    completed: number;
    late: number;
    ahead: number;
    stopsDueByNow: number;
    stopsArrived: number;
    stopsCompleted: number;
    stopsPlanned: number;
  };
  routes: RouteActual[];
}

export const LATE_THRESHOLD_MIN = 15;

const parse = (v: any): number | null => {
  const s = typeof v === 'string' ? v : v?.value;
  if (!s) return null;
  const iso = /[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : s.replace(/(\.\d{3})\d*$/, '$1') + 'Z';
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
};
const mins = (a: number | null, b: number | null) => (a != null && b != null ? Math.round((a - b) / 60000) : null);
const isReal = (v: any) => !!v?.value && v.dataSource !== 'Projected';

export function compareRouteActuals(items: any[], sessionDate: string, now = Date.now()): ActualsResponse {
  let lastCaptured: number | null = null;
  const see = (v: any) => {
    if (isReal(v)) {
      const t = parse(v);
      if (t != null && (lastCaptured == null || t > lastCaptured)) lastCaptured = t;
    }
  };

  const routes: RouteActual[] = items.map((r) => {
    const stops: any[] = r.stopActuals || [];
    const origin = stops.find((s) => s.stopType === 'OriginDepotStop')?.originDepotStopInfo;
    const plannedStart = parse(r.plannedTimestamps?.started) ?? parse(origin?.plannedStartTimestamp);
    const startedTs = r.timestamps?.started;
    const actualStart = isReal(startedTs) ? parse(startedTs) : null;
    see(startedTs);

    const sv = stops.filter((s) => s.stopType === 'ServiceableStop').map((s) => s.serviceableStopInfo || {});
    sv.forEach((s) => {
      see(s.arrivalTimestamp);
      see(s.departureTimestamp);
    });
    const arrived = sv.filter((s) => isReal(s.arrivalTimestamp));
    const completed = sv.filter((s) => isReal(s.departureTimestamp));
    const due = sv.filter((s) => {
      const t = parse(s.plannedArrivalTimestamp);
      return t != null && t <= now;
    }).length;
    const last = [...arrived].sort((a, b) => (parse(a.arrivalTimestamp) ?? 0) - (parse(b.arrivalTimestamp) ?? 0)).at(-1);

    const state: string = r.routeState || '';
    let status: ActualStatus;
    if (/complete/i.test(state)) status = 'completed';
    else if (/suspend/i.test(state)) status = 'suspended';
    else if (actualStart != null) status = 'in_progress';
    else status = plannedStart != null && plannedStart < now ? 'not_started_overdue' : 'not_started';

    const plannedEnd = parse(r.plannedTimestamps?.completed);
    const startDelay =
      actualStart != null ? mins(actualStart, plannedStart) : status === 'not_started_overdue' ? mins(now, plannedStart) : null;
    // RNA doesn't re-project routes that haven't left; shift the plan by the delay so far.
    const projectedEnd =
      status === 'not_started_overdue' && plannedEnd != null && startDelay != null
        ? plannedEnd + startDelay * 60000
        : parse(r.timestamps?.completed) ?? plannedEnd;

    return {
      routeId: r.identity?.identifier || '',
      driverName: r.workersInfo?.[0]?.name?.firstName || '',
      routeState: state,
      status,
      plannedStart,
      actualStart,
      startDelayMinutes: startDelay,
      plannedEnd,
      projectedEnd,
      endDeviationMinutes: mins(projectedEnd, plannedEnd),
      stopsPlanned: sv.length,
      stopsDueByNow: due,
      stopsArrived: arrived.length,
      stopsCompleted: completed.length,
      lastStopDelayMinutes: last ? mins(parse(last.arrivalTimestamp), parse(last.plannedArrivalTimestamp)) : null,
    };
  });

  const count = (f: (r: RouteActual) => boolean) => routes.filter(f).length;
  const sum = (f: (r: RouteActual) => number) => routes.reduce((a, r) => a + f(r), 0);
  const active = (r: RouteActual) => r.status === 'in_progress';

  return {
    sessionDate,
    asOf: now,
    lastDataCapturedAt: lastCaptured,
    totals: {
      routes: routes.length,
      started: count((r) => r.actualStart != null),
      notStartedOverdue: count((r) => r.status === 'not_started_overdue'),
      suspended: count((r) => r.status === 'suspended'),
      completed: count((r) => r.status === 'completed'),
      late: count((r) => active(r) && (r.endDeviationMinutes ?? 0) >= LATE_THRESHOLD_MIN),
      ahead: count((r) => active(r) && (r.endDeviationMinutes ?? 0) <= -LATE_THRESHOLD_MIN),
      stopsDueByNow: sum((r) => r.stopsDueByNow),
      stopsArrived: sum((r) => r.stopsArrived),
      stopsCompleted: sum((r) => r.stopsCompleted),
      stopsPlanned: sum((r) => r.stopsPlanned),
    },
    routes,
  };
}
