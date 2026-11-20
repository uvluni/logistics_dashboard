'use client';

import type { ReactNode } from 'react';
import { CheckCircle2, CloudSun, Lightbulb } from 'lucide-react';
import type { DashboardSummary, RouteKPI } from '@/types';
import { useT } from '@/i18n/useT';
import { hoursMinutes } from '@/lib/dates';
import type { MessageKey } from '@/i18n/messages';
import { Card, CardHeader } from '@/components/ui/Card';
import { cn } from '@/components/ui/cn';
import { isHighUse, isLowUse, isOvertime, isOverweight, workdayOf } from './routeStatus';

interface Group {
  key: string;
  label: MessageKey;
  dot: string;
  routes: RouteKPI[];
  detail: (k: RouteKPI) => string;
}

/** The last line of the summary's recommendation is its conclusion; the lines above repeat the lists. */
const conclusion = (text: string) => text.split('\n').map((l) => l.trim()).filter(Boolean).pop() || '';

export function AttentionCard({ kpis, summary, onOpenRoute }: { kpis: RouteKPI[]; summary: DashboardSummary; onOpenRoute: (id: string) => void }) {
  const { t } = useT();
  const weight = (k: RouteKPI) => `${Math.round(k.weightUtilization)}%`;
  const allGroups: Group[] = [
    { key: 'overweight', label: 'attention.overweight', dot: 'bg-danger', routes: kpis.filter(isOverweight), detail: weight },
    { key: 'overtime', label: 'attention.overtime', dot: 'bg-warning', routes: kpis.filter(isOvertime), detail: (k) => `+${hoursMinutes(k.totalDurationMinutes - workdayOf(k))}` },
    { key: 'high', label: 'attention.highUse', dot: 'bg-warning', routes: kpis.filter(isHighUse), detail: weight },
    { key: 'low', label: 'attention.lowUse', dot: 'bg-info', routes: kpis.filter(isLowUse), detail: weight },
  ];
  const groups = allGroups.filter((g) => g.routes.length);

  const advice = conclusion(summary.recommendation || '');
  const conditions = (summary.weatherNote || '').trim();

  return (
    <Card>
      <CardHeader title={t('attention.title')} count={groups.reduce((s, g) => s + g.routes.length, 0) || undefined} />
      <div className="divide-y divide-line">
        {groups.length === 0 && (
          <p className="flex items-center gap-2 px-4 py-4 text-sm text-ink-muted">
            <CheckCircle2 className="size-4 text-success" aria-hidden />
            {t('attention.none')}
          </p>
        )}
        {groups.map((g) => (
          <div key={g.key} className="px-4 py-3">
            <div className="mb-2 flex items-center gap-2 text-[13px] font-medium text-ink">
              <span className={cn('size-2 rounded-full', g.dot)} aria-hidden />
              {t(g.label)}
              <span className="text-ink-subtle tabular">({g.routes.length})</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {g.routes.map((k) => (
                <RouteChip key={k.routeId} onClick={() => onOpenRoute(k.routeId)} label={t('table.openRoute', { id: k.routeId })}>
                  <span className="font-semibold tabular">{k.routeId}</span>
                  <span className="sensitive max-w-[9rem] truncate text-ink-muted">{k.driverName}</span>
                  <span className="text-ink-subtle tabular">{g.detail(k)}</span>
                </RouteChip>
              ))}
            </div>
          </div>
        ))}
        {(advice || conditions) && (
          <div className="space-y-2 px-4 py-3">
            {advice && <Note icon={<Lightbulb />} title={t('attention.recommendation')} text={advice} />}
            {conditions && <Note icon={<CloudSun />} text={conditions} />}
          </div>
        )}
      </div>
    </Card>
  );
}

function RouteChip({ children, onClick, label }: { children: ReactNode; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="inline-flex h-7 items-center gap-1.5 rounded-full border border-line bg-surface-muted px-2.5 text-xs text-ink transition-colors hover:border-line-strong hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
    >
      {children}
    </button>
  );
}

function Note({ icon, title, text }: { icon: ReactNode; title?: string; text: string }) {
  return (
    <div className="flex gap-2.5 text-sm">
      <span className="mt-0.5 text-ink-subtle [&>svg]:size-4">{icon}</span>
      <p className="text-ink-muted">
        {title && <span className="font-medium text-ink">{title}: </span>}
        {text}
      </p>
    </div>
  );
}
