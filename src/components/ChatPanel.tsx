'use client';

// Chat with Claude about the ROADNET data, using the same tools as the ROADNET extension.
// Answers stream in as newline-delimited JSON events from /api/chat.
import React, { useEffect, useRef, useState } from 'react';
import { useLanguage } from '@/context/LanguageContext';
import ChatViewFrame, { type ChatView } from './ChatViewFrame';

type Lang = 'he' | 'en' | 'es';
/** An answer in the order it streamed: text, the extension's views where their tool ran, report-file links. */
type Part = { kind: 'text'; text: string } | { kind: 'view'; view: ChatView } | { kind: 'file'; name: string };
interface Msg {
  role: 'user' | 'assistant';
  text: string;
  parts: Part[];
  tools: { name: string; done: boolean; ok: boolean }[];
  error?: string;
}

const fileUrl = (name: string) => `/api/chat/file?name=${encodeURIComponent(name)}`;
const addFile = (m: Msg, name: string): Msg => (m.parts.some((p) => p.kind === 'file' && p.name === name) ? m : { ...m, parts: [...m.parts, { kind: 'file', name }] });

const STR: Record<Lang, Record<string, string>> = {
  he: {
    open: 'שאל את Claude', title: 'Claude · ROADNET', placeholder: 'שאלה על התכנון, הביצוע או הנהגים…', send: 'שלח', newChat: 'שיחה חדשה',
    hint: 'שאל בשפה רגילה, למשל: "איך נראה התכנון של מחר?", "מי מאחר עכשיו?", "למה מסלול 1003 התארך?"',
    running: 'בודק', noKey: 'לא הוגדר מפתח Claude API בשרת (ANTHROPIC_API_KEY ב-.env.local).', expired: 'החיבור ל-ROADNET פג. התחבר מחדש.', failed: 'השאלה לא נשלחה. נסה שוב.', close: 'סגור',
    expand: 'הרחב', shrink: 'הקטן', openFile: 'פתח קובץ', viewFailed: 'התצוגה לא נטענה',
  },
  en: {
    open: 'Ask Claude', title: 'Claude · ROADNET', placeholder: 'Ask about the plan, execution or drivers…', send: 'Send', newChat: 'New chat',
    hint: 'Ask in plain language, e.g. "How does tomorrow\'s plan look?", "Who is late now?", "Why did route 1003 run long?"',
    running: 'Checking', noKey: 'No Claude API key is set on the server (ANTHROPIC_API_KEY in .env.local).', expired: 'The ROADNET session expired. Log in again.', failed: 'The question was not sent. Try again.', close: 'Close',
    expand: 'Expand', shrink: 'Shrink', openFile: 'Open file', viewFailed: 'The view did not load',
  },
  es: {
    open: 'Preguntar a Claude', title: 'Claude · ROADNET', placeholder: 'Pregunta sobre el plan, la ejecución o los conductores…', send: 'Enviar', newChat: 'Nuevo chat',
    hint: 'Pregunta en lenguaje natural, p. ej. "¿Cómo se ve el plan de mañana?", "¿Quién va tarde ahora?"',
    running: 'Consultando', noKey: 'No hay clave de la API de Claude en el servidor (ANTHROPIC_API_KEY en .env.local).', expired: 'La sesión de ROADNET expiró. Inicia sesión de nuevo.', failed: 'No se envió la pregunta. Inténtalo de nuevo.', close: 'Cerrar',
    expand: 'Ampliar', shrink: 'Reducir', openFile: 'Abrir archivo', viewFailed: 'La vista no se cargó',
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

export default function ChatPanel() {
  const { language } = useLanguage();
  const s = STR[(language as Lang) in STR ? (language as Lang) : 'he'];
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  // Wide mode for the graphical views; turned on by the first view of a conversation.
  const [wide, setWide] = useState(false);
  const autoWidened = useRef(false);
  const conversationId = useRef<string | undefined>(undefined);
  const listRef = useRef<HTMLDivElement>(null);
  const busyRef = useRef(false);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [msgs.length, open]);

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
    if (busyRef.current) setInput(text);
    else send(text);
  };

  async function send(fromView?: string) {
    const question = (fromView ?? input).trim();
    if (!question || busyRef.current) return;
    if (fromView === undefined) setInput('');
    busyRef.current = true;
    setBusy(true);
    setMsgs((m) => [...m, { role: 'user', text: question, parts: [], tools: [] }, { role: 'assistant', text: '', parts: [], tools: [] }]);
    try {
      const res = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: question, conversationId: conversationId.current }) });
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({}));
        update((m) => ({ ...m, error: err.error === 'missing_api_key' ? s.noKey : res.status === 401 ? s.expired : err.error || s.failed }));
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

  if (!open)
    return (
      <button onClick={() => setOpen(true)} style={{ position: 'fixed', bottom: 24, left: 24, zIndex: 45, padding: '10px 16px', borderRadius: 22, border: 'none', background: 'var(--color-blue)', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,.25)' }}>
        💬 {s.open}
      </button>
    );

  return (
    <div style={{ position: 'fixed', bottom: 16, left: 16, zIndex: 50, width: wide ? 'min(1100px, calc(100vw - 32px))' : 'min(440px, calc(100vw - 32px))', height: wide ? 'calc(100vh - 32px)' : 'min(640px, calc(100vh - 32px))', display: 'flex', flexDirection: 'column', background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border-primary)', borderRadius: 12, boxShadow: '0 8px 30px rgba(0,0,0,.35)', overflow: 'hidden' }}>
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'var(--bg-header)', borderBottom: '1px solid var(--border-primary)' }}>
        <strong style={{ flex: 1, color: 'var(--text-header)' }}>{s.title}</strong>
        <button onClick={() => setWide((w) => !w)} title={wide ? s.shrink : s.expand} aria-label={wide ? s.shrink : s.expand} style={{ background: 'none', border: '1px solid var(--border-secondary)', color: 'var(--text-secondary)', borderRadius: 6, padding: '3px 8px', fontSize: 12, cursor: 'pointer' }}>{wide ? '⤡' : '⤢'}</button>
        <button onClick={reset} disabled={busy} style={{ background: 'none', border: '1px solid var(--border-secondary)', color: 'var(--text-secondary)', borderRadius: 6, padding: '3px 8px', fontSize: 12, cursor: 'pointer' }}>{s.newChat}</button>
        <button onClick={() => setOpen(false)} aria-label={s.close} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: 18, cursor: 'pointer' }}>×</button>
      </div>
      <div ref={listRef} style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {msgs.length === 0 && <div style={{ color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.5 }}>{s.hint}</div>}
        {msgs.map((m, i) =>
          m.role === 'user' ? (
            <div key={i} style={{ alignSelf: 'flex-start', maxWidth: '85%', background: 'var(--color-blue)', color: '#fff', padding: '8px 12px', borderRadius: 12, fontSize: 14, whiteSpace: 'pre-wrap' }}>{m.text}</div>
          ) : (
            <div key={i} style={{ alignSelf: 'stretch', fontSize: 14 }}>
              {m.tools.map((t, j) => (
                <div key={j} style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: '2px 0' }}>
                  {t.done ? (t.ok ? '✓' : '✗') : '⏳'} {s.running}: <code dir="ltr">{t.name}</code>
                </div>
              ))}
              {m.parts.map((p, j) =>
                p.kind === 'text' ? (
                  <div key={j} className="chat-md" dangerouslySetInnerHTML={{ __html: renderMarkdown(p.text) }} />
                ) : p.kind === 'view' ? (
                  <ChatViewFrame key={j} view={p.view} lang={language} onAsk={askFromView} onFile={openFileFrom(i)} failedText={s.viewFailed} />
                ) : (
                  <a key={j} href={fileUrl(p.name)} target="_blank" rel="noopener" style={{ display: 'inline-block', margin: '4px 0', fontSize: 13, color: 'var(--color-blue-light)' }}>
                    📄 {s.openFile}: <span dir="ltr">{p.name}</span>
                  </a>
                )
              )}
              {!m.text && !m.error && busy && i === msgs.length - 1 && <div style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>…</div>}
              {m.error && <div style={{ color: '#e5534b', fontSize: 13 }}>{m.error}</div>}
            </div>
          )
        )}
      </div>
      <div style={{ display: 'flex', gap: 8, padding: 10, borderTop: '1px solid var(--border-primary)' }}>
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
          style={{ flex: 1, resize: 'none', background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-secondary)', borderRadius: 8, padding: '8px 10px', fontSize: 14, fontFamily: 'inherit' }}
        />
        <button onClick={() => send()} disabled={busy || !input.trim()} style={{ alignSelf: 'stretch', padding: '0 16px', borderRadius: 8, border: 'none', background: busy || !input.trim() ? 'var(--bg-tertiary)' : 'var(--color-blue)', color: '#fff', fontWeight: 600, cursor: busy ? 'default' : 'pointer' }}>
          {s.send}
        </button>
      </div>
    </div>
  );
}
