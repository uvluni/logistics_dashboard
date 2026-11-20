'use client';

// Chat with Claude about the ROADNET data, using the same tools as the ROADNET extension.
// Answers stream in as newline-delimited JSON events from /api/chat.
import React, { useEffect, useRef, useState } from 'react';
import { useLanguage } from '@/context/LanguageContext';
import ChatViewFrame, { type ChatView } from './ChatViewFrame';
import ChatViewsMenu, { viewLabel, type ViewToolInfo } from './ChatViewsMenu';
import { Check, FileText, LayoutGrid, Loader2, Maximize2, Minimize2, SendHorizontal, ShieldCheck, Sparkles, SquarePen, X, XCircle } from 'lucide-react';
import { Button, IconButton } from './ui/Button';

type Lang = 'he' | 'en' | 'es';
/** full: Claude analyzes the data. low: Claude only picks the view, never sees data. off: no AI at all. */
type AiMode = 'full' | 'low' | 'off';
const MODES: AiMode[] = ['full', 'low', 'off'];
const RANK: Record<AiMode, number> = { off: 0, low: 1, full: 2 };
const MODE_KEY = 'roadnet-ai-mode';
/** An answer in the order it streamed: text, the extension's views where their tool ran, report-file links. */
type Part = { kind: 'text'; text: string } | { kind: 'view'; view: ChatView } | { kind: 'file'; name: string };
interface Msg {
  role: 'user' | 'assistant';
  text: string;
  parts: Part[];
  tools: { name: string; done: boolean; ok: boolean }[];
  error?: string;
  /** Answered from a saved answer, without calling the AI (low AI mode). */
  saved?: boolean;
}

const fileUrl = (name: string) => `/api/chat/file?name=${encodeURIComponent(name)}`;
const addFile = (m: Msg, name: string): Msg => (m.parts.some((p) => p.kind === 'file' && p.name === name) ? m : { ...m, parts: [...m.parts, { kind: 'file', name }] });

const STR: Record<Lang, Record<string, string>> = {
  he: {
    open: 'שאל את Claude', title: 'Claude · ROADNET', placeholder: 'שאלה על התכנון, הביצוע או הנהגים…', send: 'שלח', newChat: 'שיחה חדשה',
    hint: 'שאל בשפה רגילה, למשל: "איך נראה התכנון של מחר?", "מי מאחר עכשיו?", "למה מסלול 1003 התארך?"',
    running: 'בודק', noKey: 'לא הוגדר מפתח Claude API בשרת (ANTHROPIC_API_KEY ב-.env.local).', expired: 'החיבור ל-ROADNET פג. התחבר מחדש.', failed: 'השאלה לא נשלחה. נסה שוב.', close: 'סגור',
    expand: 'הרחב', shrink: 'הקטן', openFile: 'פתח קובץ', viewFailed: 'התצוגה לא נטענה',
    mode_full: 'AI מלא', mode_low: 'AI מינימלי', mode_off: 'ללא AI', modeLabel: 'רמת AI',
    about_full: 'Claude קורא את הנתונים ומנתח אותם.',
    about_low: 'AI מינימלי: Claude מקבל רק את השאלה ובוחר תצוגה. נתוני ROADNET לא נשלחים ל-AI.',
    about_off: 'ללא AI: שום דבר לא נשלח ל-AI. בחר תצוגה מהתפריט.',
    views: '📊 תצוגות', pick: 'בחר תצוגה…', openView: 'פתח', required: 'מלא את השדות המסומנים ב-*',
    needsAi: 'הפעולה הזו צריכה ניתוח של AI, שכבוי במצב הנוכחי. אפשר לעבור ל-"AI מלא" אם ההתקנה מאפשרת.',
    aiOff: 'ה-AI כבוי בהתקנה הזו. אפשר לפתוח תצוגות מהתפריט.',
    configError: 'לא ניתן לטעון את הגדרות הצ\'אט.', retry: 'נסה שוב', saved: '⚡ מתשובה שמורה, בלי פנייה ל-AI',
    hint_low: 'בקש תצוגה בשפה רגילה, למשל: "תכנון של מחר", "מי מאחר עכשיו", "מסלול 1003 היום". Claude פותח את התצוגה ולא רואה את הנתונים.',
    hint_off: 'בחר תצוגה מהתפריט למטה. התצוגות מציגות את הנתונים ישירות מ-ROADNET, בלי AI.',
  },
  en: {
    open: 'Ask Claude', title: 'Claude · ROADNET', placeholder: 'Ask about the plan, execution or drivers…', send: 'Send', newChat: 'New chat',
    hint: 'Ask in plain language, e.g. "How does tomorrow\'s plan look?", "Who is late now?", "Why did route 1003 run long?"',
    running: 'Checking', noKey: 'No Claude API key is set on the server (ANTHROPIC_API_KEY in .env.local).', expired: 'The ROADNET session expired. Log in again.', failed: 'The question was not sent. Try again.', close: 'Close',
    expand: 'Expand', shrink: 'Shrink', openFile: 'Open file', viewFailed: 'The view did not load',
    mode_full: 'Full AI', mode_low: 'Low AI', mode_off: 'No AI', modeLabel: 'AI level',
    about_full: 'Claude reads the data and analyzes it.',
    about_low: 'Low AI: Claude gets only your question and picks a view. ROADNET data is not sent to the AI.',
    about_off: 'No AI: nothing is sent to the AI. Pick a view from the menu.',
    views: '📊 Views', pick: 'Choose a view…', openView: 'Open', required: 'Fill in the fields marked *',
    needsAi: 'This needs AI analysis, which is off in the current mode. Switch to "Full AI" if this installation allows it.',
    aiOff: 'AI is off in this installation. You can open views from the menu.',
    configError: 'The chat settings could not be loaded.', retry: 'Try again', saved: '⚡ From a saved answer, no AI call',
    hint_low: 'Ask for a view in plain language, e.g. "tomorrow\'s plan", "who is late now", "route 1003 today". Claude opens the view and does not see the data.',
    hint_off: 'Choose a view from the menu below. Views show the data straight from ROADNET, with no AI.',
  },
  es: {
    open: 'Preguntar a Claude', title: 'Claude · ROADNET', placeholder: 'Pregunta sobre el plan, la ejecución o los conductores…', send: 'Enviar', newChat: 'Nuevo chat',
    hint: 'Pregunta en lenguaje natural, p. ej. "¿Cómo se ve el plan de mañana?", "¿Quién va tarde ahora?"',
    running: 'Consultando', noKey: 'No hay clave de la API de Claude en el servidor (ANTHROPIC_API_KEY en .env.local).', expired: 'La sesión de ROADNET expiró. Inicia sesión de nuevo.', failed: 'No se envió la pregunta. Inténtalo de nuevo.', close: 'Cerrar',
    expand: 'Ampliar', shrink: 'Reducir', openFile: 'Abrir archivo', viewFailed: 'La vista no se cargó',
    mode_full: 'IA completa', mode_low: 'IA mínima', mode_off: 'Sin IA', modeLabel: 'Nivel de IA',
    about_full: 'Claude lee los datos y los analiza.',
    about_low: 'IA mínima: Claude recibe solo tu pregunta y elige una vista. Los datos de ROADNET no se envían a la IA.',
    about_off: 'Sin IA: no se envía nada a la IA. Elige una vista del menú.',
    views: '📊 Vistas', pick: 'Elige una vista…', openView: 'Abrir', required: 'Completa los campos con *',
    needsAi: 'Esto necesita análisis de IA, que está apagada en el modo actual. Cambia a "IA completa" si la instalación lo permite.',
    aiOff: 'La IA está apagada en esta instalación. Puedes abrir vistas desde el menú.',
    configError: 'No se pudo cargar la configuración del chat.', retry: 'Reintentar', saved: '⚡ Respuesta guardada, sin llamar a la IA',
    hint_low: 'Pide una vista en lenguaje natural, p. ej. "el plan de mañana", "quién va tarde". Claude abre la vista y no ve los datos.',
    hint_off: 'Elige una vista del menú. Las vistas muestran los datos directamente desde ROADNET, sin IA.',
  },
};

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const inline = (s: string) =>
  escapeHtml(s)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\((https:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

/** Small markdown renderer for answers: headings, bullets, numbered lists, tables, bold, code, https links. Escapes first. */
function renderMarkdown(md: string): string {
  const lines = md.replace(/\r/g, '').split('\n');
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (/^\s*\|.*\|\s*$/.test(l) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
      const cells = (row: string) => row.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const head = cells(l);
      i += 2;
      const body: string[][] = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) body.push(cells(lines[i++]));
      out.push('<div class="chat-table"><table><thead><tr>' + head.map((h) => `<th>${inline(h)}</th>`).join('') + '</tr></thead><tbody>' + body.map((r) => '<tr>' + r.map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>').join('') + '</tbody></table></div>');
      continue;
    }
    if (/^\s*[-*•]\s+/.test(l)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*•]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*[-*•]\s+/, ''));
      out.push('<ul>' + items.map((t) => `<li>${inline(t)}</li>`).join('') + '</ul>');
      continue;
    }
    if (/^\s*\d+[.)]\s+/.test(l)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*\d+[.)]\s+/, ''));
      out.push('<ol>' + items.map((t) => `<li>${inline(t)}</li>`).join('') + '</ol>');
      continue;
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(l);
    if (h) out.push(`<p class="chat-h">${inline(h[2])}</p>`);
    else if (l.trim()) out.push(`<p>${inline(l)}</p>`);
    i++;
  }
  return out.join('');
}

/** Docked at the end side under the top bar; stays mounted while closed so the conversation is kept. */
export default function ChatPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { language } = useLanguage();
  const s = STR[(language as Lang) in STR ? (language as Lang) : 'he'];
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  // Wide mode for the graphical views; turned on by the first view of a conversation.
  const [wide, setWide] = useState(false);
  const autoWidened = useRef(false);
  const conversationId = useRef<string | undefined>(undefined);
  const listRef = useRef<HTMLDivElement>(null);
  const busyRef = useRef(false);
  // AI level: the installation's maximum (from the server) and this user's choice, never above it.
  const [maxMode, setMaxMode] = useState<AiMode>('off');
  const [mode, setMode] = useState<AiMode>('off');
  const [viewTools, setViewTools] = useState<ViewToolInfo[]>([]);
  const [showMenu, setShowMenu] = useState(false);
  const configLoaded = useRef(false);
  // Until the server says which AI levels are allowed, no level is shown (not a misleading "No AI").
  const [config, setConfig] = useState<'loading' | 'ready' | 'expired' | 'error'>('loading');

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [msgs.length, open]);

  const loadConfig = () => {
    configLoaded.current = true;
    setConfig('loading');
    fetch('/api/chat/config', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((c: { max: AiMode; views: ViewToolInfo[] }) => {
        const max = MODES.includes(c.max) ? c.max : 'off';
        let chosen: AiMode = max;
        try {
          const stored = localStorage.getItem(MODE_KEY) as AiMode | null;
          if (stored && MODES.includes(stored) && RANK[stored] <= RANK[max]) chosen = stored;
        } catch { /* storage unavailable: use the maximum */ }
        setMaxMode(max);
        setMode(chosen);
        setViewTools(c.views || []);
        setConfig('ready');
      })
      .catch((status) => {
        configLoaded.current = false;
        setConfig(status === 401 ? 'expired' : 'error');
      });
  };

  useEffect(() => {
    if (open && !configLoaded.current) loadConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const changeMode = (m: AiMode) => {
    if (RANK[m] > RANK[maxMode]) return;
    setMode(m);
    try { localStorage.setItem(MODE_KEY, m); } catch { /* not remembered */ }
    // A new conversation per mode: a full-AI history must not travel into low mode.
    reset();
  };

  const update = (fn: (m: Msg) => Msg) =>
    setMsgs((all) => {
      const copy = all.slice();
      copy[copy.length - 1] = fn(copy[copy.length - 1]);
      return copy;
    });
  const updateAt = (i: number, fn: (m: Msg) => Msg) => setMsgs((all) => all.map((m, j) => (j === i ? fn(m) : m)));

  const appendText = (m: Msg, text: string): Msg => {
    const last = m.parts[m.parts.length - 1];
    if (last?.kind === 'text') return { ...m, text: m.text + text, parts: [...m.parts.slice(0, -1), { kind: 'text', text: last.text + text }] };
    return { ...m, text: m.text + text, parts: [...m.parts, { kind: 'text', text }] };
  };

  /** A view asked to open a report file: try a new tab, and keep a link under that answer. */
  const openFileFrom = (i: number) => (name: string) => {
    if (!/^roadnet-[\w-]+\.(html|csv)$/i.test(name)) return;
    window.open(fileUrl(name), '_blank', 'noopener');
    updateAt(i, (m) => addFile(m, name));
  };

  /** A view asked a follow-up question: send it, or leave it in the box while an answer is running. */
  const askFromView = (text: string) => {
    // View buttons ask Claude for analysis (insights, an email draft): only in full AI mode.
    if (mode !== 'full') {
      setMsgs((m) => [...m, { role: 'assistant', text: '', parts: [], tools: [], error: s.needsAi }]);
      return;
    }
    if (busyRef.current) setInput(text);
    else send(text);
  };

  /** Opens a view straight from the menu: the tool runs on the server, no AI involved. */
  async function openView(tool: ViewToolInfo, args: Record<string, unknown>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    const label = viewLabel(tool.name, language as Lang);
    const shown = Object.values(args).filter((v) => typeof v === 'string' || typeof v === 'number').join(' · ');
    setMsgs((m) => [...m, { role: 'user', text: `📊 ${label}${shown ? ' · ' + shown : ''}`, parts: [], tools: [] }, { role: 'assistant', text: '', parts: [], tools: [{ name: tool.name, done: false, ok: true }] }]);
    try {
      const r = await fetch('/api/chat/tool', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: tool.name, arguments: args, mode }) });
      const result = await r.json().catch(() => null);
      const ok = r.ok && result && !result.isError;
      update((m) => ({ ...m, tools: m.tools.map((t) => ({ ...t, done: true, ok })) }));
      if (!ok) {
        const msg = r.status === 401 ? s.expired : (result?.content?.[0]?.text || result?.error || s.failed);
        update((m) => ({ ...m, error: String(msg).slice(0, 400) }));
        return;
      }
      update((m) => ({ ...m, parts: [...m.parts, { kind: 'view', view: { tool: tool.name, uri: tool.uri, input: args, result } }] }));
      if (!autoWidened.current) {
        autoWidened.current = true;
        setWide(true);
      }
    } catch {
      update((m) => ({ ...m, error: s.failed }));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function send(fromView?: string) {
    const question = (fromView ?? input).trim();
    if (!question || busyRef.current || mode === 'off') return;
    if (fromView === undefined) setInput('');
    busyRef.current = true;
    setBusy(true);
    setMsgs((m) => [...m, { role: 'user', text: question, parts: [], tools: [] }, { role: 'assistant', text: '', parts: [], tools: [] }]);
    try {
      const res = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: question, conversationId: conversationId.current, mode }) });
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({}));
        update((m) => ({ ...m, error: err.error === 'missing_api_key' ? s.noKey : err.error === 'ai_off' ? s.aiOff : res.status === 401 ? s.expired : err.error || s.failed }));
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl);
          buf = buf.slice(nl + 1);
          if (!line.trim()) continue;
          const e = JSON.parse(line);
          if (e.type === 'start') conversationId.current = e.conversationId;
          else if (e.type === 'text') update((m) => appendText(m, e.text));
          else if (e.type === 'view') {
            update((m) => ({ ...m, parts: [...m.parts, { kind: 'view', view: { tool: e.tool, uri: e.uri, input: e.input || {}, result: e.result } }] }));
            if (!autoWidened.current) {
              autoWidened.current = true;
              setWide(true);
            }
          } else if (e.type === 'file') update((m) => addFile(m, e.name));
          else if (e.type === 'tool') update((m) => ({ ...m, tools: [...m.tools, { name: e.name, done: false, ok: true }] }));
          else if (e.type === 'tool_done') update((m) => ({ ...m, tools: m.tools.map((t) => (t.name === e.name && !t.done ? { ...t, done: true, ok: e.ok } : t)) }));
          else if (e.type === 'saved') update((m) => ({ ...m, saved: true }));
          else if (e.type === 'error') update((m) => ({ ...m, error: e.message }));
        }
      }
    } catch {
      update((m) => ({ ...m, error: s.failed }));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  const reset = () => {
    conversationId.current = undefined;
    autoWidened.current = false;
    setMsgs([]);
  };

  return (
    <aside
      aria-label={s.title}
      aria-hidden={!open}
      // A display class, not the hidden attribute: Tailwind's `flex` would override [hidden].
      className={`fixed bottom-0 end-0 top-14 z-40 flex-col border-s border-line bg-surface text-ink shadow-lg ${open ? 'flex' : 'hidden'} ${wide ? 'w-[min(1100px,100vw)]' : 'w-[min(440px,100vw)]'}`}
    >
      <style>{`
        .chat-md p { margin: 0 0 6px; line-height: 1.5; }
        .chat-md .chat-h { font-weight: 700; margin-top: 8px; }
        .chat-md ul, .chat-md ol { margin: 0 0 6px; padding-inline-start: 20px; }
        .chat-md li { margin: 2px 0; line-height: 1.45; }
        .chat-md code { background: var(--bg-tertiary); padding: 0 4px; border-radius: 4px; font-size: 12px; }
        .chat-md a { color: var(--color-blue-light); text-decoration: underline; }
        .chat-table { overflow-x: auto; margin: 4px 0 8px; }
        .chat-table table { border-collapse: collapse; font-size: 12px; width: 100%; }
        .chat-table th, .chat-table td { border: 1px solid var(--border-secondary); padding: 4px 6px; text-align: start; white-space: nowrap; }
        .chat-table th { background: var(--bg-tertiary); font-weight: 600; }
      `}</style>
      <div className="flex items-center gap-1 border-b border-line px-3 py-2">
        <Sparkles className="ms-1 size-4 text-accent" aria-hidden />
        <strong className="flex-1 truncate px-1 text-sm font-semibold">{s.title}</strong>
        {config === 'loading' && <Loader2 className="size-4 animate-spin text-ink-subtle" aria-label="…" />}
        {config === 'ready' && (
          <select
            value={mode}
            onChange={(e) => changeMode(e.target.value as AiMode)}
            disabled={busy}
            aria-label={s.modeLabel}
            title={s.modeLabel}
            className="h-8 rounded border border-line bg-surface px-2 text-[13px] text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-focus"
          >
            {MODES.filter((m) => RANK[m] <= RANK[maxMode]).map((m) => (
              <option key={m} value={m}>{s[`mode_${m}`]}</option>
            ))}
          </select>
        )}
        {config === 'ready' && mode !== 'off' && <IconButton size="sm" label={s.views} icon={<LayoutGrid />} active={showMenu} onClick={() => setShowMenu((v) => !v)} />}
        <IconButton size="sm" label={wide ? s.shrink : s.expand} icon={wide ? <Minimize2 /> : <Maximize2 />} onClick={() => setWide((w) => !w)} />
        <IconButton size="sm" label={s.newChat} icon={<SquarePen />} onClick={reset} disabled={busy} />
        <IconButton size="sm" label={s.close} icon={<X />} onClick={onClose} />
      </div>
      {(config === 'expired' || config === 'error') && (
        <div className="flex items-center gap-2 border-b border-line bg-danger-soft px-4 py-2 text-xs text-ink">
          <XCircle className="size-3.5 shrink-0 text-danger" aria-hidden />
          <span className="flex-1">{config === 'expired' ? s.expired : s.configError}</span>
          {config === 'error' && (
            <button type="button" onClick={loadConfig} className="font-medium text-accent hover:underline">
              {s.retry}
            </button>
          )}
        </div>
      )}
      {config === 'ready' && mode !== 'full' && (
        <div className="flex items-center gap-2 border-b border-line bg-surface-muted px-4 py-2 text-xs text-ink-muted">
          <ShieldCheck className="size-3.5 shrink-0 text-success" aria-hidden />
          {s[`about_${mode}`]}
        </div>
      )}
      <div ref={listRef} className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
        {msgs.length === 0 && <p className="rounded-lg bg-surface-muted p-3 text-[13px] leading-relaxed text-ink-muted">{mode === 'full' ? s.hint : s[`hint_${mode}`]}</p>}
        {msgs.map((m, i) =>
          m.role === 'user' ? (
            <div key={i} className="max-w-[85%] self-start whitespace-pre-wrap rounded-lg rounded-ss-sm bg-primary px-3 py-2 text-sm text-primary-fg">{m.text}</div>
          ) : (
            <div key={i} className="self-stretch text-sm">
              {m.saved && <div className="mb-1 text-[11px] text-ink-subtle">{s.saved}</div>}
              {m.tools.map((t, j) => (
                <div key={j} className="my-0.5 flex items-center gap-1.5 text-xs text-ink-subtle">
                  {t.done ? t.ok ? <Check className="size-3.5 text-success" aria-hidden /> : <XCircle className="size-3.5 text-danger" aria-hidden /> : <Loader2 className="size-3.5 animate-spin" aria-hidden />}
                  {s.running}: <code dir="ltr" className="rounded bg-surface-muted px-1">{t.name}</code>
                </div>
              ))}
              {m.parts.map((p, j) =>
                p.kind === 'text' ? (
                  <div key={j} className="chat-md" dangerouslySetInnerHTML={{ __html: renderMarkdown(p.text) }} />
                ) : p.kind === 'view' ? (
                  <ChatViewFrame key={j} view={p.view} mode={mode} lang={language} onAsk={askFromView} onFile={openFileFrom(i)} failedText={s.viewFailed} />
                ) : (
                  <a key={j} href={fileUrl(p.name)} target="_blank" rel="noopener" className="my-1 inline-flex items-center gap-1.5 text-[13px] text-info hover:underline">
                    <FileText className="size-4" aria-hidden />
                    {s.openFile}: <span dir="ltr">{p.name}</span>
                  </a>
                )
              )}
              {!m.text && !m.error && busy && i === msgs.length - 1 && <Loader2 className="size-4 animate-spin text-ink-subtle" aria-label="…" />}
              {m.error && <div className="mt-1 rounded bg-danger-soft px-3 py-2 text-[13px] text-danger">{m.error}</div>}
            </div>
          )
        )}
      </div>
      {config === 'ready' && (mode === 'off' || showMenu) && (
        <ChatViewsMenu views={viewTools} lang={(language as Lang) in STR ? (language as Lang) : 'he'} busy={busy} onOpen={openView} strings={{ pick: s.pick, open: s.openView, required: s.required }} />
      )}
      {config === 'ready' && mode !== 'off' && <div className="flex gap-2 border-t border-line p-3">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          rows={2}
          maxLength={4000}
          placeholder={s.placeholder}
          aria-label={s.placeholder}
          className="flex-1 resize-none rounded border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-subtle focus:border-accent focus:outline-none focus:ring-2 focus:ring-focus"
        />
        <Button variant="primary" className="h-auto self-stretch" icon={<SendHorizontal className="rtl:-scale-x-100" />} onClick={() => send()} disabled={busy || !input.trim()}>
          {s.send}
        </Button>
      </div>}
    </aside>
  );
}
