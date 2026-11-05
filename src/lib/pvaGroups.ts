// Shared grouping/colors for the plan-vs-actual views (cards + timeline).
import type { RouteActual, ActualStatus } from '@/lib/actualsComparison';
import { LATE_THRESHOLD_MIN } from '@/lib/actualsComparison';

export type Group = 'suspended' | 'overdue' | 'late' | 'on_track' | 'ahead' | 'not_started' | 'completed';

export const GROUP_ORDER: Group[] = ['suspended', 'overdue', 'late', 'on_track', 'ahead', 'not_started', 'completed'];

export const GROUP_COLOR: Record<Group, string> = {
  suspended: '#8250df',
  overdue: '#dc2626',
  late: '#ea580c',
  on_track: '#16a34a',
  ahead: '#0969da',
  not_started: '#768390',
  completed: '#768390',
};

export function groupOf(r: RouteActual): Group {
  const map: Record<ActualStatus, Group | null> = {
    suspended: 'suspended',
    not_started_overdue: 'overdue',
    not_started: 'not_started',
    completed: 'completed',
    in_progress: null,
  };
  const g = map[r.status];
  if (g) return g;
  const dev = r.endDeviationMinutes ?? 0;
  if (dev >= LATE_THRESHOLD_MIN) return 'late';
  if (dev <= -LATE_THRESHOLD_MIN) return 'ahead';
  return 'on_track';
}

export function signed(n: number | null): string {
  if (n == null) return '';
  return n > 0 ? `+${n}` : `${n}`;
}

export function hoursMinutes(totalMinutes: number | null): string {
  if (totalMinutes == null) return '—';
  const sign = totalMinutes < 0 ? '-' : '';
  const m = Math.abs(totalMinutes);
  return `${sign}${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}

/** Sort rows: most urgent first; within a group, biggest deviation first (ahead: most ahead first). */
export function sortByUrgency<T extends { r: RouteActual; g: Group }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const d = GROUP_ORDER.indexOf(a.g) - GROUP_ORDER.indexOf(b.g);
    if (d) return d;
    if (a.g === 'ahead') return (a.r.endDeviationMinutes ?? 0) - (b.r.endDeviationMinutes ?? 0);
    return (b.r.endDeviationMinutes ?? b.r.startDelayMinutes ?? 0) - (a.r.endDeviationMinutes ?? a.r.startDelayMinutes ?? 0);
  });
}

export type AttentionLevel = 'high' | 'medium' | 'info' | 'good';
export interface Attention {
  level: AttentionLevel;
  key: string; // translation key
  vars: Record<string, string | number>;
}

/** Things a dispatcher should notice about a route, most important first. */
export function attentionFor(r: RouteActual, g: Group): Attention[] {
  const out: Attention[] = [];
  const started = r.actualStart != null;

  if (g === 'suspended') out.push({ level: 'high', key: 'pva.att.suspended', vars: {} });
  if (g === 'overdue') out.push({ level: 'high', key: 'pva.att.not_left', vars: { n: r.startDelayMinutes ?? 0 } });

  if (r.projectedWorkMinutes != null && r.projectedWorkMinutes > r.workDayMinutes && g !== 'completed') {
    out.push({
      level: 'medium',
      key: 'pva.att.long_day',
      vars: { h: hoursMinutes(r.projectedWorkMinutes), over: r.projectedWorkMinutes - r.workDayMinutes },
    });
  }

  const lateStops = r.stops.filter((s) => s.status === 'late').length;
  if (started && lateStops > 0) out.push({ level: 'medium', key: 'pva.att.stops_behind', vars: { n: lateStops } });

  const atStop = r.stops.find((s) => s.status === 'at_stop');
  if (atStop && atStop.minutesAtStop != null && atStop.plannedServiceMinutes != null) {
    const over = atStop.minutesAtStop - atStop.plannedServiceMinutes;
    if (over >= 15) out.push({ level: 'medium', key: 'pva.att.long_service', vars: { customer: atStop.customer || '—', n: over } });
  }

  const lastArrived = [...r.stops].filter((s) => s.actualArrival != null).sort((a, b) => (a.actualArrival ?? 0) - (b.actualArrival ?? 0)).at(-1);
  if (lastArrived?.arrivalDelayMinutes != null && lastArrived.arrivalDelayMinutes >= 15) {
    out.push({ level: 'info', key: 'pva.att.late_arrival', vars: { n: lastArrived.arrivalDelayMinutes } });
  }

  if (started && (r.startDelayMinutes ?? 0) >= 20) out.push({ level: 'info', key: 'pva.att.late_start', vars: { n: r.startDelayMinutes ?? 0 } });

  if (g === 'ahead') out.push({ level: 'good', key: 'pva.att.ahead', vars: { n: Math.abs(r.endDeviationMinutes ?? 0) } });

  return out;
}
