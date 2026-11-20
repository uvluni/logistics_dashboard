import type { RouteKPI } from '@/types';
import type { Tone } from '@/components/ui/Badge';
import type { MessageKey } from '@/i18n/messages';

export const DEFAULT_WORKDAY_MIN = 540;

export const workdayOf = (k: RouteKPI) => k.normalWorkDayMinutes || DEFAULT_WORKDAY_MIN;
export const isOverweight = (k: RouteKPI) => (k.rounds?.length ? k.rounds.some((r) => r.weightUtilization > 100) : k.weightUtilization > 100);
export const isOvertime = (k: RouteKPI) => k.totalDurationMinutes > workdayOf(k);
export const isHighUse = (k: RouteKPI) => k.weightUtilization >= 85 && k.weightUtilization <= 100;
export const isLowUse = (k: RouteKPI) => k.weightUtilization < 50;

export interface RouteStatus {
  key: 'overweight' | 'overtime' | 'low' | 'ok';
  label: MessageKey;
  tone: Tone;
  /** Lower sorts first: the most urgent routes on top. */
  rank: number;
}

/** The single most important status of a route, for the table badge. */
export function routeStatus(k: RouteKPI): RouteStatus {
  if (isOverweight(k)) return { key: 'overweight', label: 'status.overweight', tone: 'danger', rank: 0 };
  if (isOvertime(k)) return { key: 'overtime', label: 'status.overtime', tone: 'warning', rank: 1 };
  if (isLowUse(k)) return { key: 'low', label: 'status.low', tone: 'info', rank: 2 };
  return { key: 'ok', label: 'status.ok', tone: 'success', rank: 3 };
}
