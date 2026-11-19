'use client';

// Chat with Claude about the ROADNET data, using the same tools as the ROADNET extension.
// Answers stream in as newline-delimited JSON events from /api/chat.
import React, { useEffect, useRef, useState } from 'react';
import { useLanguage } from '@/context/LanguageContext';

type Lang = 'he' | 'en' | 'es';
interface Msg {
  role: 'user' | 'assistant';
  text: string;
  tools: { name: string; done: boolean; ok: boolean }[];
  error?: string;
}

const STR: Record<Lang, Record<string, string>> = {
  he: {
    open: 'שאל את Claude', title: 'Claude · ROADNET', placeholder: 'שאלה על התכנון, הביצוע או הנהגים…', send: 'שלח', newChat: 'שיחה חדשה',
    hint: 'שאל בשפה רגילה, למשל: "איך נראה התכנון של מחר?", "מי מאחר עכשיו?", "למה מסלול 1003 התארך?"',
    running: 'בודק', noKey: 'לא הוגדר מפתח Claude API בשרת (ANTHROPIC_API_KEY ב-.env.local).', expired: 'החיבור ל-ROADNET פג. התחבר מחדש.', failed: 'השאלה לא נשלחה. נסה שוב.', close: 'סגור',
  },
  en: {
    open: 'Ask Claude', title: 'Claude · ROADNET', placeholder: 'Ask about the plan, execution or drivers…', send: 'Send', newChat: 'New chat',
    hint: 'Ask in plain language, e.g. "How does tomorrow\'s plan look?", "Who is late now?", "Why did route 1003 run long?"',
    running: 'Checking', noKey: 'No Claude API key is set on the server (ANTHROPIC_API_KEY in .env.local).', expired: 'The ROADNET session expired. Log in again.', failed: 'The question was not sent. Try again.', close: 'Close',
  },
  es: {
    open: 'Preguntar a Claude', title: 'Claude · ROADNET', placeholder: 'Pregunta sobre el plan, la ejecución o los conductores…', send: 'Enviar', newChat: 'Nuevo chat',
    hint: 'Pregunta en lenguaje natural, p. ej. "¿Cómo se ve el plan de mañana?", "¿Quién va tarde ahora?"',
    running: 'Consultando', noKey: 'No hay clave de la API de Claude en el servidor (ANTHROPIC_API_KEY en .env.local).', expired: 'La sesión de ROADNET expiró. Inicia sesión de nuevo.', failed: 'No se envió la pregunta. Inténtalo de nuevo.', close: 'Cerrar',
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
  const conversationId = useRef<string | undefined>(undefined);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [msgs, open]);

  const update = (fn: (m: Msg) => Msg) =>
    setMsgs((all) => {
      const copy = all.slice();
      copy[copy.length - 1] = fn(copy[copy.length - 1]);
      return copy;
    });

  async function send() {
    const question = input.trim();
    if (!question || busy) return;
    setInput('');
    setBusy(true);
    setMsgs((m) => [...m, { role: 'user', text: question, tools: [] }, { role: 'assistant', text: '', tools: [] }]);
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
          else if (e.type === 'text') update((m) => ({ ...m, text: m.text + e.text }));
          else if (e.type === 'tool') update((m) => ({ ...m, tools: [...m.tools, { name: e.name, done: false, ok: true }] }));
          else if (e.type === 'tool_done') update((m) => ({ ...m, tools: m.tools.map((t) => (t.name === e.name && !t.done ? { ...t, done: true, ok: e.ok } : t)) }));
          else if (e.type === 'error') update((m) => ({ ...m, error: e.message }));
        }
      }
    } catch {
      update((m) => ({ ...m, error: s.failed }));
    } finally {
      setBusy(false);
    }
  }

  const reset = () => {
    conversationId.current = undefined;
    setMsgs([]);
  };

  if (!open)
    return (
      <button onClick={() => setOpen(true)} style={{ position: 'fixed', bottom: 24, left: 24, zIndex: 45, padding: '10px 16px', borderRadius: 22, border: 'none', background: 'var(--color-blue)', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,.25)' }}>
        💬 {s.open}
      </button>
    );

  return (
    <div style={{ position: 'fixed', bottom: 16, left: 16, zIndex: 50, width: 'min(440px, calc(100vw - 32px))', height: 'min(640px, calc(100vh - 32px))', display: 'flex', flexDirection: 'column', background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border-primary)', borderRadius: 12, boxShadow: '0 8px 30px rgba(0,0,0,.35)', overflow: 'hidden' }}>
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
              {m.text && <div className="chat-md" dangerouslySetInnerHTML={{ __html: renderMarkdown(m.text) }} />}
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
        <button onClick={send} disabled={busy || !input.trim()} style={{ alignSelf: 'stretch', padding: '0 16px', borderRadius: 8, border: 'none', background: busy || !input.trim() ? 'var(--bg-tertiary)' : 'var(--color-blue)', color: '#fff', fontWeight: 600, cursor: busy ? 'default' : 'pointer' }}>
          {s.send}
        </button>
      </div>
    </div>
  );
}
