'use client';

import { useState } from 'react';
import { CalendarX2, Download, FileSpreadsheet, RefreshCw, Sparkles } from 'lucide-react';
import { useT } from '@/i18n/useT';
import { formatLongDate } from '@/lib/dates';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button, IconButton } from '@/components/ui/Button';
import { Menu } from '@/components/ui/Menu';
import { Alert, EmptyState, Skeleton } from '@/components/ui/Feedback';
import { Card } from '@/components/ui/Card';
import { usePlan, useInsights } from './usePlan';
import { PlanKpis } from './PlanKpis';
import { AttentionCard } from './AttentionCard';
import { RoutesTable } from './RoutesTable';
import { RouteDrawer } from './RouteDrawer';
import { InsightsCard } from './InsightsCard';
import { downloadOrdersReport, downloadRoutesReport, downloadStopsReport, SessionExpiredError } from './exports';

export function PlanScreen({ date, onExpired }: { date: string; onExpired: () => void }) {
  const { t, language, locale } = useT();
  const { kpis, summary, state, reload } = usePlan(date, language, onExpired);
  const { insights, generate, dismiss } = useInsights(date, language, kpis, onExpired);
  const [openRoute, setOpenRoute] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState(false);

  const hasRoutes = state === 'ready' && !!summary && kpis.length > 0;

  const download = async (run: () => Promise<void>) => {
    setDownloadError(false);
    try {
      await run();
    } catch (e) {
      if (e instanceof SessionExpiredError) onExpired();
      else setDownloadError(true);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('plan.title')}
        subtitle={
          <>
            {formatLongDate(date, locale)}
            {hasRoutes && <> · {t('plan.routesCount', { n: kpis.length })}</>}
          </>
        }
        actions={
          <>
            <Button icon={<Sparkles />} onClick={generate} disabled={!hasRoutes} loading={insights.status === 'loading'}>
              {t('plan.insights')}
            </Button>
            <Menu
              width="w-60"
              trigger={(p) => (
                <Button {...p} icon={<Download />} disabled={!hasRoutes}>
                  {t('plan.export')}
                </Button>
              )}
              sections={[
                {
                  items: [
                    { key: 'routes', label: t('plan.exportRoutes'), icon: <FileSpreadsheet />, onSelect: () => download(() => downloadRoutesReport(kpis, date)) },
                    { key: 'stops', label: t('plan.exportStops'), icon: <FileSpreadsheet />, onSelect: () => download(() => downloadStopsReport(date)) },
                    { key: 'orders', label: t('plan.exportOrders'), icon: <FileSpreadsheet />, onSelect: () => download(() => downloadOrdersReport(date)) },
                  ],
                },
              ]}
            />
            <IconButton variant="secondary" label={t('common.refresh')} icon={<RefreshCw className={state === 'loading' ? 'animate-spin' : undefined} />} onClick={reload} disabled={state === 'loading'} />
          </>
        }
      />

      {downloadError && <Alert tone="danger">{t('error.download')}</Alert>}

      {state === 'error' && (
        <Alert tone="danger" action={<Button size="sm" onClick={reload}>{t('common.retry')}</Button>}>
          {t('error.load')}
        </Alert>
      )}

      {(state === 'loading' || state === 'idle') && <PlanSkeleton />}

      {state === 'ready' && kpis.length === 0 && (
        <Card>
          <EmptyState icon={<CalendarX2 />} title={t('plan.empty')} hint={t('plan.emptyHint')} />
        </Card>
      )}

      {hasRoutes && summary && (
        <>
          <PlanKpis summary={summary} kpis={kpis} />
          <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="min-w-0 space-y-5">
              <InsightsCard state={insights} onClose={dismiss} onRetry={generate} />
              <RoutesTable kpis={kpis} onOpen={setOpenRoute} />
            </div>
            <AttentionCard kpis={kpis} summary={summary} onOpenRoute={setOpenRoute} />
          </div>
        </>
      )}

      <RouteDrawer route={kpis.find((k) => k.routeId === openRoute) ?? null} onClose={() => setOpenRoute(null)} />
    </div>
  );
}

function PlanSkeleton() {
  const { t } = useT();
  return (
    <div className="space-y-5" role="status" aria-label={t('plan.loading')}>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-[104px] rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-96 rounded-lg" />
    </div>
  );
}
