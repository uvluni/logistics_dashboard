'use client';

// Shows one of the ROADNET extension's graphical views inside the chat, the way Claude Desktop does:
// the view's page runs in a sandboxed frame (no access to this site, its cookies or the network),
// and talks to this page over the MCP Apps protocol (AppBridge). Its tool calls go through
// /api/chat/tool, which only allows the extension's read-only view tools.
import React, { useEffect, useRef, useState } from 'react';
import type { McpUiHostContext } from '@modelcontextprotocol/ext-apps/app-bridge';

export interface ChatView {
  tool: string;
  uri: string;
  input: Record<string, unknown>;
  result: { content: { type: string; text?: string }[]; isError?: boolean };
}
interface ViewPage {
  html: string;
  imageDomains: string[];
}

const pages = new Map<string, Promise<ViewPage>>();
function loadPage(uri: string): Promise<ViewPage> {
  let p = pages.get(uri);
  if (!p) {
    p = fetch(`/api/chat/view?uri=${encodeURIComponent(uri)}`).then(async (r) => {
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
      return r.json();
    });
    pages.set(uri, p);
    p.catch(() => pages.delete(uri));
  }
  return p;
}

/** The view's page with a strict content policy: inline code only, images from the map tile servers, no network. */
function withPolicy(page: ViewPage): string {
  const img = ['data:', 'blob:', ...page.imageDomains].join(' ');
  const csp = `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src ${img}; font-src data:; connect-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'`;
  const meta = `<meta http-equiv="Content-Security-Policy" content="${csp}">`;
  return /<head[^>]*>/i.test(page.html) ? page.html.replace(/<head[^>]*>/i, (h) => h + meta) : meta + page.html;
}

const currentTheme = (): 'light' | 'dark' => (document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');

/** The dashboard's colors, as the MCP Apps style variables the views read. */
function hostStyles() {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string) => css.getPropertyValue(name).trim() || undefined;
  const variables = {
    '--color-text-primary': v('--text-primary'),
    '--color-text-secondary': v('--text-secondary'),
    '--color-text-tertiary': v('--text-tertiary'),
    '--color-border-primary': v('--border-primary'),
    '--color-background-primary': v('--bg-card'),
    '--color-background-secondary': v('--bg-tertiary'),
  };
  return { variables: Object.fromEntries(Object.entries(variables).filter(([, x]) => x)) };
}
const hostContext = () => ({ theme: currentTheme(), styles: hostStyles() });

export default function ChatViewFrame({ view, lang, onAsk, onFile, failedText }: {
  view: ChatView;
  lang: string;
  /** A question the view asks on the user's behalf (e.g. "draft an email"). */
  onAsk: (text: string) => void;
  /** A report file the view wants to open. */
  onFile: (name: string) => void;
  failedText: string;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(320);
  const [error, setError] = useState<string | null>(null);
  // The latest callbacks, without restarting the view when the parent re-renders.
  const cb = useRef({ onAsk, onFile });
  cb.current = { onAsk, onFile };

  useEffect(() => {
    let cancelled = false;
    let bridge: { close(): Promise<void> } | null = null;
    let observer: MutationObserver | null = null;
    (async () => {
      try {
        const [{ AppBridge, PostMessageTransport }, page] = await Promise.all([import('@modelcontextprotocol/ext-apps/app-bridge'), loadPage(view.uri)]);
        const iframe = frame.current;
        if (cancelled || !iframe?.contentWindow) return;
        const b = new AppBridge(
          null,
          { name: 'ROADNET dashboard', version: '1.0.0' },
          { openLinks: {}, serverTools: {}, logging: {} },
          // The style list is partial: the views fall back to their own colors for the rest.
          { hostContext: { ...hostContext(), locale: lang, displayMode: 'inline', availableDisplayModes: ['inline'], platform: 'web' } as unknown as McpUiHostContext }
        );
        bridge = b;
        b.oncalltool = async (params) => {
          if (params.name === 'open_report_file') {
            const name = String((params.arguments as { file?: string } | undefined)?.file || '').split(/[\\/]/).pop() || '';
            cb.current.onFile(name);
            return { content: [{ type: 'text', text: JSON.stringify({ opened: name }) }] };
          }
          const r = await fetch('/api/chat/tool', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: params.name, arguments: params.arguments || {} }) });
          if (!r.ok) return { content: [{ type: 'text', text: (await r.json().catch(() => ({}))).error || `HTTP ${r.status}` }], isError: true };
          return r.json();
        };
        b.onmessage = async (params) => {
          const text = (params.content || []).map((c) => (c.type === 'text' ? c.text : '')).join('\n').trim();
          if (text) cb.current.onAsk(text);
          return {};
        };
        b.onopenlink = async ({ url }) => {
          if (/^https:\/\//i.test(url)) window.open(url, '_blank', 'noopener,noreferrer');
          return {};
        };
        b.onrequestdisplaymode = async () => ({ mode: 'inline' });
        b.onsizechange = ({ height: h }) => {
          if (typeof h === 'number' && h > 0) setHeight(Math.min(Math.max(Math.ceil(h), 120), 1600));
        };
        b.oninitialized = () => {
          b.sendToolInput({ arguments: view.input });
          b.sendToolResult(view.result as Parameters<typeof b.sendToolResult>[0]);
        };
        await b.connect(new PostMessageTransport(iframe.contentWindow, iframe.contentWindow));
        if (cancelled) return;
        iframe.srcdoc = withPolicy(page);
        // Follow the dashboard's light / dark switch.
        // getComputedStyle after the switch: wait a frame for the new theme's variables.
        observer = new MutationObserver(() => requestAnimationFrame(() => b.sendHostContextChange(hostContext() as Parameters<typeof b.sendHostContextChange>[0])));
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
      observer?.disconnect();
      bridge?.close().catch(() => undefined);
    };
    // One view per mount: its tool result does not change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.uri]);

  if (error) return <div style={{ color: '#e5534b', fontSize: 12, margin: '4px 0' }}>{failedText}: {error}</div>;
  return (
    <iframe
      ref={frame}
      title={view.tool}
      sandbox="allow-scripts"
      style={{ width: '100%', height, border: '1px solid var(--border-secondary)', borderRadius: 8, background: 'var(--bg-secondary)', display: 'block', margin: '6px 0' }}
    />
  );
}
