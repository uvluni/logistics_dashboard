'use client';

// Opens one of the extension's views directly, with no AI: pick a view, fill its few fields, open.
// The fields come from the tool's own argument schema; known ones get friendly labels.
import React, { useMemo, useState } from 'react';

type Lang = 'he' | 'en' | 'es';
export interface ViewToolInfo {
  name: string;
  uri: string;
  inputSchema: { properties?: Record<string, { type?: string; enum?: string[]; description?: string }>; required?: string[] };
}

const L = (lang: Lang, he: string, en: string) => (lang === 'he' ? he : en);

// Menu order and names. Views not listed here still appear, under their tool name, at the end.
const VIEWS: [string, string, string][] = [
  ['show_calculation', 'חישובים מובנים (תשובה מוכנה)', 'Built-in calculations (ready answers)'],
  ['show_plan_dashboard', 'תכנון יומי וניצולת', 'Daily plan and utilization'],
  ['show_live_dashboard', 'מצב בשטח: תכנון מול ביצוע', 'Live: plan vs actual'],
  ['show_route_details', 'מסלול אחד: תחנות ומפה', 'One route: stops and map'],
  ['show_preflight', 'בדיקת תכנון לפני יציאה', 'Plan check before dispatch'],
  ['show_fleet_now', 'איפה המשאיות עכשיו', 'Where the trucks are now'],
  ['show_driver_positions', 'מיקום הנהג בדיווחים (GPS)', 'Driver report locations (GPS)'],
  ['show_report', 'דוח יומי / שבועי / חודשי', 'Daily / weekly / monthly report'],
  ['show_trends', 'מגמות לתקופה', 'Trends over a period'],
  ['show_lateness', 'איחורים', 'Lateness'],
  ['show_plan_adherence', 'עמידה בתכנון', 'Plan adherence'],
  ['show_root_cause', 'למה מסלול התארך', 'Why a route ran long'],
  ['show_driver_scorecard', 'כרטיס נהגים', 'Driver scorecard'],
  ['show_driver_plans', 'דפי משימות לנהגים', 'Driver task sheets'],
  ['show_driver_payroll', 'שעות נהגים לשכר', 'Driver hours for payroll'],
  ['show_service_times', 'זמני שירות בפועל', 'Actual service times'],
  ['show_service_calibration', 'כיול זמני שירות', 'Service time calibration'],
  ['show_location_check', 'מיקומי לקוחות שגויים', 'Wrong customer locations'],
  ['show_location_audit', 'ביקורת מיקומים', 'Location audit'],
  ['show_customer_profile', 'כרטיס לקוח', 'Customer profile'],
  ['show_customer_heatmap', 'מפת חום לקוחות', 'Customer heat map'],
  ['show_order_status', 'סטטוס הזמנה', 'Order status'],
  ['show_pod', 'אישור מסירה (POD)', 'Proof of delivery (POD)'],
  ['show_order_integrity', 'תקינות הזמנות', 'Order integrity'],
  ['show_workload_forecast', 'עומס צפוי בימים הקרובים', 'Workload forecast'],
  ['show_replan', 'תכנון חלופי', 'Alternative plan'],
  ['show_mirror_report', 'השוואת תקופות', 'Period comparison'],
  ['show_cost_layer', 'שכבת עלויות', 'Cost layer'],
  ['show_app_health', 'דיווח מאפליקציית הנהג', 'Driver app reporting'],
  ['build_stops_export', 'ייצוא תחנות', 'Stops export'],
  ['show_notification_outbox', 'הודעות שנוצרו (בדיקה)', 'Notification outbox (test)'],
];
// Not offered here: runs the alert engine, which is more than viewing.
const HIDDEN_VIEWS = new Set(['run_notifications']);
// Arguments the menu never sets (side effects or not useful by hand).
const HIDDEN_ARGS = new Set(['language', 'refresh', 'post_to_teams', 'notes', 'every', 'replayDate']);

const ARG_LABELS: Record<string, [string, string]> = {
  sessionDate: ['תאריך', 'Date'],
  date: ['תאריך', 'Date'],
  startDate: ['מתאריך', 'From'],
  endDate: ['עד תאריך', 'To'],
  baselineStart: ['תקופת השוואה: מתאריך', 'Baseline from'],
  baselineEnd: ['תקופת השוואה: עד', 'Baseline to'],
  routeId: ['מספר מסלול', 'Route'],
  customerId: ['מספר לקוח', 'Customer number'],
  orderId: ['מספר הזמנה', 'Order number'],
  period: ['תקופה', 'Period'],
  days: ['ימים', 'Days'],
  historyDays: ['ימי היסטוריה', 'History days'],
  region: ['אזור', 'Region'],
  maxCustomers: ['מקסימום לקוחות לנהג', 'Max customers per driver'],
  metric: ['מדד', 'Metric'],
  reportedOnly: ['רק מדווחים', 'Reported only'],
  normalWorkDayMinutes: ['יום עבודה (דקות)', 'Work day (minutes)'],
  calc: ['חישוב', 'Calculation'],
  threshold: ['סף (דקות או %)', 'Limit (minutes or %)'],
  top: ['כמה להציג', 'How many'],
};
const ENUM_LABELS: Record<string, [string, string]> = {
  day_summary: ['סיכום יום', 'Day summary'],
  overtime_routes: ['מסלולים שחורגים מיום העבודה', 'Routes over the work day'],
  light_routes: ['מסלולים קלים ואפשרויות איחוד', 'Light routes and merge options'],
  late_stops: ['תחנות באיחור', 'Late stops'],
  missing_reports: ['מסלולים ותחנות בלי דיווח', 'Routes and stops without reports'],
  plan_gap: ['פער בין תכנון לביצוע', 'Plan vs actual gap'],
  long_service: ['פריקות ארוכות מהמתוכנן', 'Service longer than planned'],
  by_city: ['פילוח לפי עיר', 'By city'],
  top_customers: ['לקוחות מובילים', 'Top customers'],
  driver_summary: ['סיכום נהגים', 'Driver summary'],
  daily_trend: ['מגמה לפי יום', 'Day by day'],
  weekday_pattern: ['עומס לפי יום בשבוע', 'Load by weekday'],
  daily: ['יומי', 'Daily'], weekly: ['שבועי', 'Weekly'], monthly: ['חודשי', 'Monthly'], visits: ['ביקורים', 'Visits'], kg: ['משקל', 'Weight'],
};
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(Date.now());

export function viewLabel(name: string, lang: Lang): string {
  const v = VIEWS.find((x) => x[0] === name);
  return v ? L(lang, v[1], v[2]) : name;
}

export default function ChatViewsMenu({ views, lang, busy, onOpen, strings }: {
  views: ViewToolInfo[];
  lang: Lang;
  busy: boolean;
  onOpen: (tool: ViewToolInfo, args: Record<string, unknown>) => void;
  strings: { pick: string; open: string; required: string };
}) {
  const ordered = useMemo(() => {
    const avail = views.filter((v) => !HIDDEN_VIEWS.has(v.name));
    const known = VIEWS.map((x) => avail.find((v) => v.name === x[0])).filter(Boolean) as ViewToolInfo[];
    return [...known, ...avail.filter((v) => !VIEWS.some((x) => x[0] === v.name))];
  }, [views]);
  const [name, setName] = useState('');
  const [values, setValues] = useState<Record<string, string | boolean>>({});
  const tool = ordered.find((v) => v.name === name);
  const props = Object.entries(tool?.inputSchema.properties || {}).filter(([k]) => !HIDDEN_ARGS.has(k));
  const required = new Set(tool?.inputSchema.required || []);

  const choose = (n: string) => {
    setName(n);
    const t = ordered.find((v) => v.name === n);
    // Required dates start at today; everything else is left to the view's own default.
    const init: Record<string, string | boolean> = {};
    for (const k of t?.inputSchema.required || []) if (/date/i.test(k)) init[k] = today();
    setValues(init);
  };

  const missing = props.some(([k]) => required.has(k) && (values[k] === undefined || values[k] === ''));
  const open = () => {
    if (!tool || missing) return;
    const args: Record<string, unknown> = {};
    for (const [k, p] of props) {
      const v = values[k];
      if (v === undefined || v === '') continue;
      args[k] = p.type === 'integer' || p.type === 'number' ? Number(v) : v;
    }
    onOpen(tool, args);
  };

  const field: React.CSSProperties = { background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-secondary)', borderRadius: 6, padding: '5px 8px', fontSize: 13, fontFamily: 'inherit' };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 10, borderTop: '1px solid var(--border-primary)' }}>
      <select value={name} onChange={(e) => choose(e.target.value)} style={field}>
        <option value="">{strings.pick}</option>
        {ordered.map((v) => (
          <option key={v.name} value={v.name}>{viewLabel(v.name, lang)}</option>
        ))}
      </select>
      {tool && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end' }}>
          {props.map(([k, p]) => {
            const label = (ARG_LABELS[k] ? L(lang, ARG_LABELS[k][0], ARG_LABELS[k][1]) : k) + (required.has(k) ? ' *' : '');
            const set = (v: string | boolean) => setValues((old) => ({ ...old, [k]: v }));
            let input: React.ReactNode;
            if (p.enum) {
              input = (
                <select value={String(values[k] ?? '')} onChange={(e) => set(e.target.value)} style={field}>
                  <option value="">—</option>
                  {p.enum.map((o) => <option key={o} value={o}>{ENUM_LABELS[o] ? L(lang, ENUM_LABELS[o][0], ENUM_LABELS[o][1]) : o}</option>)}
                </select>
              );
            } else if (p.type === 'boolean') {
              input = <input type="checkbox" checked={values[k] === true} onChange={(e) => set(e.target.checked)} />;
            } else if (/date/i.test(k)) {
              input = <input type="date" value={String(values[k] ?? '')} onChange={(e) => set(e.target.value)} style={field} />;
            } else {
              input = <input type={p.type === 'integer' || p.type === 'number' ? 'number' : 'text'} value={String(values[k] ?? '')} onChange={(e) => set(e.target.value)} style={{ ...field, width: 130 }} dir="ltr" />;
            }
            return (
              <label key={k} style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 11, color: 'var(--text-secondary)' }}>
                {label}
                {input}
              </label>
            );
          })}
          <button onClick={open} disabled={busy || missing} title={missing ? strings.required : undefined} style={{ padding: '6px 16px', borderRadius: 8, border: 'none', background: busy || missing ? 'var(--bg-tertiary)' : 'var(--color-blue)', color: '#fff', fontWeight: 600, cursor: busy || missing ? 'default' : 'pointer' }}>
            {strings.open}
          </button>
        </div>
      )}
    </div>
  );
}
