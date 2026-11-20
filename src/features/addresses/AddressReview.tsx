'use client';

// Customers whose ROADNET location is probably wrong (from the Airtable review table). For each
// one the user keeps either the Google location or the ROADNET location; the choice is saved back.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, RefreshCw } from 'lucide-react';
import { useT } from '@/i18n/useT';
import type { MessageKey } from '@/i18n/messages';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardHeader } from '@/components/ui/Card';
import { Badge, type Tone } from '@/components/ui/Badge';
import { Button, IconButton } from '@/components/ui/Button';
import { Alert, EmptyState, Skeleton } from '@/components/ui/Feedback';

const GOOGLE = 'Choose Google coordinates';
const ROADNET = 'Choose Roadnet coordinates';

interface AirtableRecord {
  id: string;
  fields: Record<string, unknown>;
}

const SCORE: Record<string, { label: MessageKey; tone: Tone; rank: number }> = {
  '3': { label: 'score.fix', tone: 'danger', rank: 0 },
  '2': { label: 'score.check', tone: 'warning', rank: 1 },
};
const scoreOf = (r: AirtableRecord) => SCORE[String(r.fields['Geocode Recommendation'] ?? '')] ?? { label: 'score.ok' as MessageKey, tone: 'success' as Tone, rank: 2 };

export function AddressReview({ onExpired }: { onExpired: () => void }) {
  const { t } = useT();
  const [records, setRecords] = useState<AirtableRecord[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const [saving, setSaving] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);

  const load = useCallback(async () => {
    setState('loading');
    try {
      const res = await fetch('/api/airtable', { credentials: 'include' });
      if (res.status === 401) return onExpired();
      if (!res.ok) throw new Error();
      setRecords((await res.json()).records || []);
      setState('ready');
    } catch {
      setState('unavailable');
    }
  }, [onExpired]);

  useEffect(() => {
    load();
  }, [load]);

  const pending = useMemo(
    () => records.filter((r) => !r.fields[GOOGLE] && !r.fields[ROADNET]).sort((a, b) => scoreOf(a).rank - scoreOf(b).rank),
    [records]
  );

  async function choose(id: string, field: typeof GOOGLE | typeof ROADNET) {
    setSaving(id);
    setNotice(null);
    try {
      const res = await fetch('/api/airtable', { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ recordId: id, field }) });
      if (res.status === 401) return onExpired();
      if (!res.ok) throw new Error();
      setRecords((rs) => rs.map((r) => (r.id === id ? { ...r, fields: { ...r.fields, [field]: true } } : r)));
      setNotice({ tone: 'success', text: t('addr.saved') });
    } catch {
      setNotice({ tone: 'danger', text: t('addr.saveFailed') });
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader title={t('addr.title')} subtitle={t('addr.subtitle')} actions={<IconButton variant="secondary" label={t('common.refresh')} icon={<RefreshCw />} onClick={load} />} />

      {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}
      {state === 'unavailable' && <Alert tone="warning">{t('addr.notConfigured')}</Alert>}
      {state === 'loading' && <Skeleton className="h-80 rounded-lg" />}

      {state === 'ready' && (
        <Card className="overflow-hidden">
          <CardHeader title={t('addr.title')} count={t('addr.pending', { n: pending.length })} />
          {pending.length === 0 ? (
            <EmptyState icon={<CheckCircle2 />} title={t('addr.empty')} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-line bg-surface-muted text-[13px] text-ink-muted">
                    {(['addr.city', 'addr.street', 'addr.score', 'addr.reason', 'addr.action'] as const).map((k) => (
                      <th key={k} scope="col" className="h-10 whitespace-nowrap px-3 text-start font-medium">
                        {t(k)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pending.map((r) => {
                    const score = scoreOf(r);
                    const busy = saving === r.id;
                    return (
                      <tr key={r.id} className="border-b border-line last:border-0 hover:bg-surface-hover">
                        <td dir="auto" className="whitespace-nowrap px-3 py-2.5 text-start font-medium text-ink">{String(r.fields['City'] ?? '—')}</td>
                        <td dir="auto" className="px-3 py-2.5 text-start text-ink">{String(r.fields['Address Line 1'] ?? '—')}</td>
                        <td className="px-3 py-2.5">
                          <Badge tone={score.tone}>{t(score.label)}</Badge>
                        </td>
                        <td dir="auto" className="max-w-md px-3 py-2.5 text-start text-[13px] leading-relaxed text-ink-muted">{String(r.fields['Reason'] ?? '—')}</td>
                        <td className="px-3 py-2.5">
                          <div className="flex gap-2">
                            <Button size="sm" onClick={() => choose(r.id, GOOGLE)} disabled={busy}>
                              {t('addr.useGoogle')}
                            </Button>
                            <Button size="sm" variant="primary" onClick={() => choose(r.id, ROADNET)} loading={busy}>
                              {t('addr.useRoadnet')}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
