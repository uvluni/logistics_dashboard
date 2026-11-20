'use client';

// Every view and built-in calculation of the ROADNET extension, opened straight from the portal.
// No AI is involved: the tool runs on the server (blind mode) and its view renders here.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, BarChart3, Calculator, CalendarRange, Coins, MapPin, Package, Sparkles, Truck, Users } from 'lucide-react';
import { useT } from '@/i18n/useT';
import type { Language } from '@/i18n/translations';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Alert, Skeleton } from '@/components/ui/Feedback';
import ChatViewFrame, { type ChatView } from '@/components/ChatViewFrame';
import { ONE_DAY_CALCS, ToolForm, enumLabel, groupLabel, groupOf, orderedTools, viewLabel, type ToolGroup, type ViewToolInfo } from '@/components/ChatViewsMenu';

const GROUP_ORDER: ToolGroup[] = ['calc', 'plan', 'live', 'drivers', 'customers', 'orders', 'analysis', 'reports'];
const GROUP_ICON: Record<ToolGroup, ReactNode> = {
  calc: <Calculator />,
  plan: <CalendarRange />,
  live: <Truck />,
  drivers: <Users />,
  customers: <MapPin />,
  orders: <Package />,
  analysis: <Coins />,
  reports: <BarChart3 />,
};

type Load = { state: 'loading' } | { state: 'ready'; views: ViewToolInfo[] } | { state: 'error' };

/** A tile: a view, or one built-in calculation (show_calculation with its `calc` fixed). */
interface Pick {
  tool: ViewToolInfo;
  calc?: string;
}
const pickKey = (p: Pick) => p.tool.name + (p.calc ? `:${p.calc}` : '');

export function ToolsScreen({ date, onExpired, onAskClaude }: { date: string; onExpired: () => void; onAskClaude: () => void }) {
  const { t, language, isRTL } = useT();
  const lang = language as Language;
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [selected, setSelected] = useState<Pick | null>(null);
  const [view, setView] = useState<ChatView | null>(null);
  const [running, setRunning] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'danger' | 'info'; text: string } | null>(null);

  useEffect(() => {
    fetch('/api/chat/config', { cache: 'no-store' })
      .then((r) => {
        if (r.status === 401) {
          onExpired();
          throw new Error('expired');
        }
        return r.ok ? r.json() : Promise.reject(new Error(String(r.status)));
      })
      .then((c: { views?: ViewToolInfo[] }) => setLoad(c.views?.length ? { state: 'ready', views: c.views } : { state: 'error' }))
      .catch(() => setLoad((l) => (l.state === 'loading' ? { state: 'error' } : l)));
  }, [onExpired]);

  const groups = useMemo(() => {
    if (load.state !== 'ready') return [];
    const picks: Pick[] = orderedTools(load.views).flatMap((tool) => {
      // Each built-in calculation gets its own tile.
      const calcs = tool.name === 'show_calculation' ? tool.inputSchema.properties?.calc?.enum : undefined;
      return calcs?.length ? calcs.map((calc) => ({ tool, calc })) : [{ tool }];
    });
    return GROUP_ORDER.map((g) => ({ g, picks: picks.filter((p) => groupOf(p.tool.name) === g) })).filter((x) => x.picks.length);
  }, [load]);

  const labelOf = (p: Pick) => (p.calc ? enumLabel(p.calc, lang) : viewLabel(p.tool.name, lang));

  const choose = (p: Pick | null) => {
    setSelected(p);
    setView(null);
    setNotice(null);
  };

  async function run(tool: ViewToolInfo, args: Record<string, unknown>) {
    setRunning(true);
    setNotice(null);
    setView(null);
    try {
      // mode "off": the tools server runs blind; nothing here goes to an AI.
      const res = await fetch('/api/chat/tool', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: tool.name, arguments: args, mode: 'off' }) });
      if (res.status === 401) return onExpired();
      const result = await res.json().catch(() => null);
      if (!res.ok || !result || result.isError) {
        setNotice({ tone: 'danger', text: String(result?.content?.[0]?.text || result?.error || t('tools.failed')).slice(0, 400) });
        return;
      }
      setView({ tool: tool.name, uri: tool.uri, input: args, result });
    } catch {
      setNotice({ tone: 'danger', text: t('tools.failed') });
    } finally {
      setRunning(false);
    }
  }

  const Back = isRTL ? ArrowRight : ArrowLeft;

  return (
    <div className="space-y-5">
      <PageHeader
        title={selected ? labelOf(selected) : t('tools.title')}
        subtitle={selected ? groupLabel(groupOf(selected.tool.name), lang) : t('tools.subtitle')}
        actions={
          selected && (
            <Button icon={<Back />} onClick={() => choose(null)}>
              {t('tools.back')}
            </Button>
          )
        }
      />

      {load.state === 'loading' && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {Array.from({ length: 12 }, (_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
      )}
      {load.state === 'error' && <Alert tone="warning">{t('tools.unavailable')}</Alert>}

      {load.state === 'ready' && !selected && (
        <div className="space-y-6">
          {groups.map(({ g, picks }) => (
            <section key={g} aria-labelledby={`tools-${g}`}>
              <h2 id={`tools-${g}`} className="mb-2.5 flex items-center gap-2 text-[13px] font-semibold text-ink-muted [&>svg]:size-4">
                {GROUP_ICON[g]}
                {groupLabel(g, lang)}
              </h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
                {picks.map((p) => (
                  <button
                    key={pickKey(p)}
                    type="button"
                    onClick={() => choose(p)}
                    className="flex min-h-24 flex-col justify-between gap-3 rounded-lg border border-line bg-surface p-4 text-start shadow-sm transition-colors hover:border-accent hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                  >
                    <span className="flex size-8 items-center justify-center rounded-md bg-info-soft text-info [&>svg]:size-4">{GROUP_ICON[g]}</span>
                    <span className="text-sm font-medium leading-snug text-ink">{labelOf(p)}</span>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {selected && (
        <>
          <Card>
            <CardHeader title={t('tools.parameters')} />
            <div className="px-4 py-3">
              <ToolForm
                key={pickKey(selected)}
                tool={selected.tool}
                lang={lang}
                busy={running}
                onOpen={run}
                defaultDate={date}
                fixed={selected.calc ? { calc: selected.calc } : undefined}
                prefillDate={!selected.calc || ONE_DAY_CALCS.has(selected.calc)}
                strings={{ open: t('tools.open'), required: t('tools.required') }}
              />
            </div>
          </Card>
          {notice && (
            <Alert tone={notice.tone} action={notice.tone === 'info' ? <Button size="sm" icon={<Sparkles />} onClick={onAskClaude}>{t('top.ask')}</Button> : undefined}>
              {notice.text}
            </Alert>
          )}
          {running && <Skeleton className="h-96 rounded-lg" />}
          {view && (
            <Card className="overflow-hidden p-2">
              <ChatViewFrame
                key={`${view.tool}-${JSON.stringify(view.input)}`}
                view={view}
                mode="off"
                lang={lang}
                failedText={t('tools.failed')}
                onFile={(name) => window.open(`/api/chat/file?name=${encodeURIComponent(name)}`, '_blank', 'noopener')}
                onAsk={() => setNotice({ tone: 'info', text: t('tools.needsAi') })}
              />
            </Card>
          )}
        </>
      )}
    </div>
  );
}
