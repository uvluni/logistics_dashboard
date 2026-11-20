'use client';

// Opens one of the extension's views directly, with no AI: pick a view, fill its few fields, open.
// The fields come from the tool's own argument schema; known ones get friendly labels.
import React, { useMemo, useState } from 'react';
import { Button } from './ui/Button';
import { DateField } from './ui/DateField';

type Lang = 'he' | 'en' | 'es';
export interface ViewToolInfo {
  name: string;
  uri: string;
  inputSchema: { properties?: Record<string, { type?: string; enum?: string[]; description?: string }>; required?: string[] };
}

const L = (lang: Lang, he: string, en: string) => (lang === 'he' ? he : en);

// Menu order and names. Views not listed here still appear, under their tool name, at the end.
export type ToolGroup = 'calc' | 'plan' | 'live' | 'drivers' | 'customers' | 'orders' | 'analysis' | 'reports';
export const VIEWS: [string, string, string, ToolGroup][] = [
  ['show_calculation', 'חישובים מובנים (תשובה מוכנה)', 'Built-in calculations (ready answers)', 'calc'],
  ['show_plan_dashboard', 'תכנון יומי וניצולת', 'Daily plan and utilization', 'plan'],
  ['show_live_dashboard', 'מצב בשטח: תכנון מול ביצוע', 'Live: plan vs actual', 'live'],
  ['show_route_details', 'מסלול אחד: תחנות ומפה', 'One route: stops and map', 'plan'],
  ['show_preflight', 'בדיקת תכנון לפני יציאה', 'Plan check before dispatch', 'plan'],
  ['show_fleet_now', 'איפה המשאיות עכשיו', 'Where the trucks are now', 'live'],
  ['show_driver_positions', 'מיקום הנהג בדיווחים (GPS)', 'Driver report locations (GPS)', 'live'],
  ['show_report', 'דוח יומי / שבועי / חודשי', 'Daily / weekly / monthly report', 'reports'],
  ['show_trends', 'מגמות לתקופה', 'Trends over a period', 'reports'],
  ['show_lateness', 'איחורים', 'Lateness', 'analysis'],
  ['show_plan_adherence', 'עמידה בתכנון', 'Plan adherence', 'analysis'],
  ['show_root_cause', 'למה מסלול התארך', 'Why a route ran long', 'analysis'],
  ['show_driver_scorecard', 'כרטיס נהגים', 'Driver scorecard', 'drivers'],
  ['show_driver_plans', 'דפי משימות לנהגים', 'Driver task sheets', 'drivers'],
  ['show_driver_payroll', 'שעות נהגים לשכר', 'Driver hours for payroll', 'drivers'],
  ['show_service_times', 'זמני שירות בפועל', 'Actual service times', 'customers'],
  ['show_service_calibration', 'כיול זמני שירות', 'Service time calibration', 'customers'],
  ['show_location_check', 'מיקומי לקוחות שגויים', 'Wrong customer locations', 'customers'],
  ['show_location_audit', 'ביקורת מיקומים', 'Location audit', 'customers'],
  ['show_customer_profile', 'כרטיס לקוח', 'Customer profile', 'customers'],
  ['show_customer_heatmap', 'מפת חום לקוחות', 'Customer heat map', 'customers'],
  ['show_order_status', 'סטטוס הזמנה', 'Order status', 'orders'],
  ['show_pod', 'אישור מסירה (POD)', 'Proof of delivery (POD)', 'orders'],
  ['show_order_integrity', 'תקינות הזמנות', 'Order integrity', 'orders'],
  ['show_workload_forecast', 'עומס צפוי בימים הקרובים', 'Workload forecast', 'plan'],
  ['show_replan', 'תכנון חלופי', 'Alternative plan', 'plan'],
  ['show_mirror_report', 'השוואת תקופות', 'Period comparison', 'reports'],
  ['show_cost_layer', 'שכבת עלויות', 'Cost layer', 'analysis'],
  ['show_app_health', 'דיווח מאפליקציית הנהג', 'Driver app reporting', 'drivers'],
  ['build_stops_export', 'ייצוא תחנות', 'Stops export', 'reports'],
  ['show_notification_outbox', 'הודעות שנוצרו (בדיקה)', 'Notification outbox (test)', 'live'],
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
const todayIso = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(Date.now());

export function viewLabel(name: string, lang: Lang): string {
  const v = VIEWS.find((x) => x[0] === name);
  return v ? L(lang, v[1], v[2]) : name;
}

export const GROUP_LABELS: Record<ToolGroup, [string, string]> = {
  calc: ['תשובות מוכנות', 'Ready answers'],
  plan: ['תכנון', 'Planning'],
  live: ['ביצוע ומעקב', 'Execution and tracking'],
  drivers: ['נהגים', 'Drivers'],
  customers: ['לקוחות ומיקומים', 'Customers and locations'],
  orders: ['הזמנות ומסירה', 'Orders and delivery'],
  analysis: ['ניתוח ועלויות', 'Analysis and costs'],
  reports: ['דוחות ומגמות', 'Reports and trends'],
};
export const groupLabel = (g: ToolGroup, lang: Lang) => L(lang, GROUP_LABELS[g][0], GROUP_LABELS[g][1]);
export const enumLabel = (value: string, lang: Lang) => (ENUM_LABELS[value] ? L(lang, ENUM_LABELS[value][0], ENUM_LABELS[value][1]) : value);
/** Built-in calculations that cover one day (the rest cover a period and default to recent weeks). */
export const ONE_DAY_CALCS = new Set(['day_summary', 'overtime_routes', 'light_routes', 'late_stops', 'missing_reports', 'plan_gap', 'long_service', 'by_city']);
export const groupOf = (name: string): ToolGroup => VIEWS.find((x) => x[0] === name)?.[3] ?? 'reports';

/** The views the server offers, in catalog order (unknown ones at the end), without hidden ones. */
export function orderedTools(views: ViewToolInfo[]): ViewToolInfo[] {
  const avail = views.filter((v) => !HIDDEN_VIEWS.has(v.name));
  const known = VIEWS.map((x) => avail.find((v) => v.name === x[0])).filter(Boolean) as ViewToolInfo[];
  return [...known, ...avail.filter((v) => !VIEWS.some((x) => x[0] === v.name))];
}

const FIELD = 'h-8 rounded border border-line bg-surface px-2 text-[13px] text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-focus';

/**
 * The fields of one view's arguments and an Open button. Required dates start at `defaultDate`
 * (else today); everything else is left to the view's own default.
 */
export function ToolForm({ tool, lang, busy, onOpen, strings, defaultDate, fixed, prefillDate = true }: {
  tool: ViewToolInfo;
  lang: Lang;
  busy: boolean;
  onOpen: (tool: ViewToolInfo, args: Record<string, unknown>) => void;
  strings: { open: string; required: string };
  defaultDate?: string;
  /** Arguments set by the caller (e.g. which built-in calculation); they get no field. */
  fixed?: Record<string, unknown>;
  /** Fill an optional one-day date field with the working date (off for period calculations). */
  prefillDate?: boolean;
}) {
  const props = Object.entries(tool.inputSchema.properties || {}).filter(([k]) => !HIDDEN_ARGS.has(k) && !(fixed && k in fixed));
  const required = new Set(tool.inputSchema.required || []);
  const initial = () => {
    const init: Record<string, string | boolean> = {};
    for (const k of tool.inputSchema.required || []) if (/date/i.test(k)) init[k] = defaultDate || todayIso();
    // A one-day date field follows the working date even when it is optional.
    if (prefillDate) for (const [k] of props) if ((k === 'sessionDate' || k === 'date') && defaultDate) init[k] = defaultDate;
    return init;
  };
  const [values, setValues] = useState<Record<string, string | boolean>>(initial);
  const missing = props.some(([k]) => required.has(k) && (values[k] === undefined || values[k] === ''));

  const open = () => {
    if (missing) return;
    const args: Record<string, unknown> = { ...fixed };
    for (const [k, p] of props) {
      const v = values[k];
      if (v === undefined || v === '') continue;
      args[k] = p.type === 'integer' || p.type === 'number' ? Number(v) : v;
    }
    onOpen(tool, args);
  };

  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        open();
      }}
    >
      {props.map(([k, p]) => {
        const label = (ARG_LABELS[k] ? L(lang, ARG_LABELS[k][0], ARG_LABELS[k][1]) : k) + (required.has(k) ? ' *' : '');
        const set = (v: string | boolean) => setValues((old) => ({ ...old, [k]: v }));
        let input: React.ReactNode;
        if (p.enum) {
          input = (
            <select value={String(values[k] ?? '')} onChange={(e) => set(e.target.value)} className={FIELD}>
              <option value="">—</option>
              {p.enum.map((o) => <option key={o} value={o}>{ENUM_LABELS[o] ? L(lang, ENUM_LABELS[o][0], ENUM_LABELS[o][1]) : o}</option>)}
            </select>
          );
        } else if (p.type === 'boolean') {
          input = <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={values[k] === true} onChange={(e) => set(e.target.checked)} />;
        } else if (/date/i.test(k) || k === 'baselineStart' || k === 'baselineEnd') {
          input = <DateField value={String(values[k] ?? '')} onChange={set} label={label} />;
        } else {
          input = <input type={p.type === 'integer' || p.type === 'number' ? 'number' : 'text'} value={String(values[k] ?? '')} onChange={(e) => set(e.target.value)} className={`${FIELD} w-32`} dir="ltr" />;
        }
        return (
          <label key={k} className="flex flex-col gap-1 text-[11px] font-medium text-ink-muted">
            {label}
            {input}
          </label>
        );
      })}
      <Button type="submit" variant="primary" size="sm" disabled={busy || missing} title={missing ? strings.required : undefined}>
        {strings.open}
      </Button>
    </form>
  );
}

/** The chat's compact picker: one select for the view, then its fields. */
export default function ChatViewsMenu({ views, lang, busy, onOpen, strings }: {
  views: ViewToolInfo[];
  lang: Lang;
  busy: boolean;
  onOpen: (tool: ViewToolInfo, args: Record<string, unknown>) => void;
  strings: { pick: string; open: string; required: string };
}) {
  const ordered = useMemo(() => orderedTools(views), [views]);
  const [name, setName] = useState('');
  const tool = ordered.find((v) => v.name === name);

  return (
    <div className="flex flex-col gap-2 border-t border-line bg-surface-muted p-3">
      <select value={name} onChange={(e) => setName(e.target.value)} className={FIELD} aria-label={strings.pick}>
        <option value="">{strings.pick}</option>
        {ordered.map((v) => (
          <option key={v.name} value={v.name}>{viewLabel(v.name, lang)}</option>
        ))}
      </select>
      {tool && <ToolForm key={tool.name} tool={tool} lang={lang} busy={busy} onOpen={onOpen} strings={strings} />}
    </div>
  );
}
