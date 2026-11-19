// Connects the dashboard to the ROADNET extension's own tools server (MCP over stdio), one server
// process per logged-in session. The process gets only the session's ROADNET token (token mode):
// no password, no other secrets of this app, and its own state files, so it never touches the
// environment that Claude Desktop is using.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface McpTool {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}
/** A tool result as the extension's views expect it (MCP CallToolResult). */
export interface ToolResult {
  content: { type: string; text?: string; [k: string]: unknown }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}
interface Session {
  client: Client;
  /** Tools the model may call (app-only tools left out). */
  tools: McpTool[];
  /** Tool name → its view's resource URI (ui://...), for tools that have a view. */
  views: Map<string, string>;
  /** Tools the views may call themselves: tools with a view and app-only tools. */
  viewCallable: Set<string>;
  /** Cached view pages: uri → { html, imageDomains }. */
  pages: Map<string, Promise<ViewPage>>;
  instructions: string;
  reportsDir: string;
  lastUsed: number;
}
export interface ViewPage {
  html: string;
  /** Extra origins the view may load images from (map tiles). */
  imageDomains: string[];
}

const IDLE_MS = 15 * 60_000;
// Kept on globalThis so dev hot-reloads don't orphan running server processes.
const g = globalThis as unknown as { __roadnetMcp?: Map<string, Promise<Session>>; __roadnetMcpSweep?: NodeJS.Timeout };
const sessions = (g.__roadnetMcp ??= new Map());

export const sessionKey = (token: string) => createHash('sha256').update(token).digest('hex').slice(0, 32);

/** Where the extension's server build lives: ROADNET_MCP_SERVER, else the sibling roadnet-plugin repo. */
export function serverPath(): string {
  return process.env.ROADNET_MCP_SERVER || path.resolve(process.cwd(), '..', 'roadnet-plugin', 'plugins', 'roadnet', 'server', 'dist', 'index.js');
}

const stateDir = (token: string) => path.join(os.tmpdir(), 'roadnet-dashboard', sessionKey(token).slice(0, 12));

type ToolMeta ={ _meta?: { ui?: { visibility?: string[]; resourceUri?: string } } };
const appOnly = (t: ToolMeta) => {
  const vis = t._meta?.ui?.visibility;
  return Array.isArray(vis) && vis.length === 1 && vis[0] === 'app';
};

async function start(token: string): Promise<Session> {
  const file = serverPath();
  if (!existsSync(file)) throw new Error(`ROADNET tools server not found at ${file}. Build roadnet-plugin or set ROADNET_MCP_SERVER.`);
  const state = stateDir(token);
  const reportsDir = reportsDirOf(token);
  const client = new Client({ name: 'roadnet-dashboard', version: '1.0.0' });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [file],
    // Only what the tools server needs; this app's own secrets (Claude key, Airtable) are not passed on.
    env: {
      RNA_API_TOKEN: token,
      RNA_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL || '',
      RNA_ENV_FILE: path.join(state, 'no-env-file'),
      RNA_ACTIVE_ENV_FILE: path.join(state, 'active-environment.json'),
      // Report files stay in this session's own folder; the chat serves them from there.
      RNA_REPORTS_DIR: reportsDir,
      ...(process.env.ROADNET_CHAT_PRIVACY_MODE ? { RNA_PRIVACY_MODE: process.env.ROADNET_CHAT_PRIVACY_MODE } : {}),
      ...(process.env.ROADNET_CHAT_HIDE_DRIVER_NAMES ? { RNA_HIDE_DRIVER_NAMES: process.env.ROADNET_CHAT_HIDE_DRIVER_NAMES } : {}),
    },
    stderr: 'ignore',
  });
  await client.connect(transport);
  const { tools } = await client.listTools();
  const views = new Map<string, string>();
  const viewCallable = new Set<string>();
  for (const t of tools as (typeof tools[number] & ToolMeta)[]) {
    const uri = t._meta?.ui?.resourceUri;
    if (typeof uri === 'string' && uri.startsWith('ui://')) {
      views.set(t.name, uri);
      viewCallable.add(t.name);
    }
    if (appOnly(t)) viewCallable.add(t.name);
  }
  return {
    client,
    tools: tools.filter((t) => !appOnly(t as ToolMeta)).map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema as Record<string, unknown> })),
    views,
    viewCallable,
    pages: new Map(),
    instructions: client.getInstructions() || '',
    reportsDir,
    lastUsed: Date.now(),
  };
}

/** The tools server for this session's token, started on first use and stopped after 15 idle minutes. */
export async function mcpFor(token: string): Promise<Session> {
  const key = sessionKey(token);
  let p = sessions.get(key);
  if (!p) {
    p = start(token);
    sessions.set(key, p);
    p.catch(() => sessions.delete(key));
  }
  const s = await p;
  s.lastUsed = Date.now();
  if (!g.__roadnetMcpSweep) {
    g.__roadnetMcpSweep = setInterval(async () => {
      for (const [k, sp] of sessions) {
        const s2 = await sp.catch(() => null);
        if (!s2 || Date.now() - s2.lastUsed > IDLE_MS) {
          sessions.delete(k);
          await s2?.client.close().catch(() => undefined);
        }
      }
    }, 60_000);
    g.__roadnetMcpSweep.unref?.();
  }
  return s;
}

/** Runs one tool and returns the full result (content blocks and isError). */
export async function callToolRaw(token: string, name: string, args: Record<string, unknown>): Promise<ToolResult> {
  const s = await mcpFor(token);
  const r = await s.client.callTool({ name, arguments: args }, undefined, { timeout: 240_000 });
  return { content: (r.content as ToolResult['content']) || [], structuredContent: r.structuredContent as ToolResult['structuredContent'], isError: !!r.isError };
}

/** The text of a tool result. */
export const resultText = (r: ToolResult) => r.content.filter((c) => c.type === 'text').map((c) => c.text || '').join('\n') || '(no output)';

/** Runs one tool; errors come back as text so the model can read them and adjust. */
export async function callTool(token: string, name: string, args: Record<string, unknown>): Promise<{ text: string; isError: boolean }> {
  const r = await callToolRaw(token, name, args);
  return { text: resultText(r), isError: !!r.isError };
}

/** The view page (HTML) a tool's result is shown in, or undefined if the tool has no view. */
export async function viewUriOf(token: string, toolName: string): Promise<string | undefined> {
  return (await mcpFor(token)).views.get(toolName);
}

/** Reads a view page from the tools server (cached per session). Only URIs of this server's tools. */
export async function readView(token: string, uri: string): Promise<ViewPage> {
  const s = await mcpFor(token);
  if (![...s.views.values()].includes(uri)) throw new Error('Unknown view');
  let p = s.pages.get(uri);
  if (!p) {
    p = s.client.readResource({ uri }).then((r) => {
      const c = r.contents[0] as { text?: string; _meta?: { ui?: { csp?: { resourceDomains?: string[] } } } } | undefined;
      if (!c?.text) throw new Error('Empty view');
      const imageDomains = (c._meta?.ui?.csp?.resourceDomains || []).filter((d) => /^https:\/\/[\w.-]+$/.test(d));
      return { html: c.text, imageDomains };
    });
    s.pages.set(uri, p);
    p.catch(() => s.pages.delete(uri));
  }
  return p;
}

/** Whether a view may call this tool itself (refresh, its own data). */
export async function viewMayCall(token: string, name: string): Promise<boolean> {
  return (await mcpFor(token)).viewCallable.has(name);
}

/** This session's reports folder (files written by the tools server). */
export const reportsDirOf = (token: string) => path.join(stateDir(token), 'reports');
