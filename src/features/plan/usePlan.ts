'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { DashboardSummary, RouteKPI } from '@/types';
import type { Language } from '@/i18n/translations';

export type LoadState = 'idle' | 'loading' | 'ready' | 'error';

/** The day's routes with their KPIs and the day summary (/api/routes). */
export function usePlan(date: string, language: Language, onExpired: () => void) {
  const [kpis, setKpis] = useState<RouteKPI[]>([]);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [state, setState] = useState<LoadState>('idle');
  const request = useRef(0);

  const load = useCallback(async () => {
    if (!date) return;
    const id = ++request.current;
    setState('loading');
    try {
      const res = await fetch(`/api/routes?${new URLSearchParams({ sessionDate: date, language })}`, { credentials: 'include' });
      if (id !== request.current) return; // a newer date was chosen meanwhile
      if (res.status === 401) return onExpired();
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (id !== request.current) return;
      setKpis(data.kpis || []);
      setSummary(data.summary || null);
      setState('ready');
    } catch {
      if (id === request.current) setState('error');
    }
  }, [date, language, onExpired]);

  useEffect(() => {
    load();
  }, [load]);

  return { kpis, summary, state, reload: load };
}

export type InsightsState = { status: 'idle' } | { status: 'loading' } | { status: 'ready'; text: string; ai: boolean } | { status: 'error' };

/**
 * Plan insights (/api/insights). With full AI the server asks Claude; in low or no-AI mode, or
 * without a key, it answers with its local rule-based insights.
 */
export function useInsights(date: string, language: Language, kpis: RouteKPI[], onExpired: () => void) {
  const [insights, setInsights] = useState<InsightsState>({ status: 'idle' });

  // A different day or language makes the old insights stale.
  useEffect(() => setInsights({ status: 'idle' }), [date, language]);

  const generate = useCallback(async () => {
    if (!kpis.length) return;
    setInsights({ status: 'loading' });
    try {
      const routesData = kpis.map((k) => ({
        'Route ID': k.routeId,
        'Driver Name': k.driverName,
        'Vehicle Type': k.vehicleType,
        'Total Duration (min)': k.totalDurationMinutes,
        'Travel Time (min)': k.travelTimeMinutes,
        'Service Time (min)': k.serviceTimeMinutes,
        Stops: k.stopCount,
        Rounds: k.rounds?.length || 0,
        'Total Weight (kg)': k.totalWeight,
        'Vehicle Capacity (kg)': k.vehicleCapacity,
        'Weight Utilization (%)': k.weightUtilization,
        'Time Utilization (%)': k.timeUtilization,
      }));
      let aiMode: string | undefined;
      try {
        aiMode = localStorage.getItem('roadnet-ai-mode') || undefined;
      } catch {
        aiMode = undefined;
      }
      const res = await fetch('/api/insights', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ routesData, language, aiMode }),
      });
      if (res.status === 401) return onExpired();
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setInsights({ status: 'ready', text: String(data.insights || '').trim(), ai: data.source !== 'local' });
    } catch {
      setInsights({ status: 'error' });
    }
  }, [kpis, language, onExpired]);

  return { insights, generate, dismiss: () => setInsights({ status: 'idle' }) };
}
