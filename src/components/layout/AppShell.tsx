'use client';

import { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { todayIso } from '@/lib/dates';
import { PlanScreen } from '@/features/plan/PlanScreen';
import { AddressReview } from '@/features/addresses/AddressReview';
import { ToolsScreen } from '@/features/tools/ToolsScreen';
import PlanVsActual from '@/components/PlanVsActual';
import ChatPanel from '@/components/ChatPanel';
import { TopBar } from './TopBar';
import { ModuleNav, VIEWS, type ViewId } from './ModuleNav';
import { DateNavigator } from './DateNavigator';

// Leaflet touches window on import: the map screens load on the client only.
const DriverMap = dynamic(() => import('@/components/DriverMap'), { ssr: false });
const CustomerHeatmap = dynamic(() => import('@/components/CustomerHeatmap'), { ssr: false });

const viewFromHash = (): ViewId => {
  const id = window.location.hash.slice(1);
  return VIEWS.some((v) => v.id === id) ? (id as ViewId) : 'plan';
};

/** The signed-in app: top bar, screen navigation with the working date, the screen, and the chat. */
export function AppShell({ onLogout, onExpired }: { onLogout: () => void; onExpired: () => void }) {
  const [view, setView] = useState<ViewId>('plan');
  const [date, setDate] = useState(todayIso);
  const [chatOpen, setChatOpen] = useState(false);

  // The screen is kept in the address (#plan, #actual ...) so a reload or a shared link opens it.
  useEffect(() => {
    setView(viewFromHash());
    const onHash = () => setView(viewFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const go = useCallback((v: ViewId) => {
    setView(v);
    history.replaceState(null, '', `#${v}`);
  }, []);

  // The heat map has its own period and address review has no date: no working-date control there.
  const datedView = view !== 'addresses' && view !== 'heat';

  return (
    <div className="min-h-screen bg-app">
      <TopBar chatOpen={chatOpen} onToggleChat={() => setChatOpen((o) => !o)} onLogout={onLogout} />
      <ModuleNav view={view} onChange={go} end={datedView ? <DateNavigator value={date} onChange={setDate} /> : undefined} />

      <main className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6">
        {view === 'plan' && <PlanScreen date={date} onExpired={onExpired} />}
        {view === 'actual' && <PlanVsActual sessionDate={date} onDateChange={setDate} />}
        {view === 'map' && <DriverMap sessionDate={date} onDateChange={setDate} />}
        {view === 'heat' && <CustomerHeatmap sessionDate={date} />}
        {view === 'tools' && <ToolsScreen date={date} onExpired={onExpired} onAskClaude={() => setChatOpen(true)} />}
        {view === 'addresses' && <AddressReview onExpired={onExpired} />}
      </main>

      <ChatPanel open={chatOpen} onClose={() => setChatOpen(false)} />
    </div>
  );
}
