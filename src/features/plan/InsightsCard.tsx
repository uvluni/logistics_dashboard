'use client';

import { Cpu, Sparkles, X } from 'lucide-react';
import { useT } from '@/i18n/useT';
import { Card, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { IconButton } from '@/components/ui/Button';
import { Alert, Skeleton } from '@/components/ui/Feedback';
import type { InsightsState } from './usePlan';

export function InsightsCard({ state, onClose, onRetry }: { state: InsightsState; onClose: () => void; onRetry: () => void }) {
  const { t } = useT();
  if (state.status === 'idle') return null;
  return (
    <Card className="animate-fade-in">
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <Sparkles className="size-4 text-accent" aria-hidden />
            {t('insights.title')}
          </span>
        }
        actions={
          <>
            {state.status === 'ready' && (
              <Badge tone={state.ai ? 'info' : 'neutral'} icon={state.ai ? <Sparkles /> : <Cpu />}>
                {state.ai ? t('insights.ai') : t('insights.local')}
              </Badge>
            )}
            <IconButton size="sm" label={t('common.close')} icon={<X />} onClick={onClose} />
          </>
        }
      />
      <div className="px-4 py-4">
        {state.status === 'loading' && (
          <div className="space-y-2" aria-label={t('insights.generating')} role="status">
            <Skeleton className="h-3.5 w-11/12" />
            <Skeleton className="h-3.5 w-4/5" />
            <Skeleton className="h-3.5 w-2/3" />
          </div>
        )}
        {state.status === 'error' && (
          <Alert tone="warning" action={<button className="text-sm font-medium text-accent hover:underline" onClick={onRetry}>{t('common.retry')}</button>}>
            {t('insights.failed')}
          </Alert>
        )}
        {state.status === 'ready' && <div className="whitespace-pre-wrap text-sm leading-relaxed text-ink-muted">{state.text}</div>}
      </div>
    </Card>
  );
}
