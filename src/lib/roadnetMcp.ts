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
interface Session {
  client: Client;
  tools: McpTool[];
  instructions: string;
  lastUsed: number;
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

/** App-only tools feed the extension's views; the chat has no views, so they are left out. */
const forChat = (t: { _meta?: { ui?: { visibility?: string[] } } }) => {
  const vis = t._meta?.ui?.visibility;
  return !(Array.isArray(vis) && vis.length === 1 && vis[0] === 'app');
};

async function start(token: string): Promise<Session> {
  const file = serverPath();
  if (!existsSync(file)) throw new Error(`ROADNET tools server not found at ${file}. Build roadnet-plugin or set ROADNET_MCP_SERVER.`);
  const state = path.join(os.tmpdir(), 'roadnet-dashboard', sessionKey(token).slice(0, 12));
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
      ...(process.env.ROADNET_CHAT_PRIVACY_MODE ? { RNA_PRIVACY_MODE: process.env.ROADNET_CHAT_PRIVACY_MODE } : {}),
      ...(process.env.ROADNET_CHAT_HIDE_DRIVER_NAMES ? { RNA_HIDE_DRIVER_NAMES: process.env.ROADNET_CHAT_HIDE_DRIVER_NAMES } : {}),
    },
    stderr: 'ignore',
  });
  await client.connect(transport);
  const { tools } = await client.listTools();
  return {
    client,
    tools: tools.filter(forChat).map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema as Record<string, unknown> })),
    instructions: client.getInstructions() || '',
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

/** Runs one tool; errors come back as text so the model can read them and adjust. */
export async function callTool(token: string, name: string, args: Record<string, unknown>): Promise<{ text: string; isError: boolean }> {
  const s = await mcpFor(token);
  const r = await s.client.callTool({ name, arguments: args }, undefined, { timeout: 240_000 });
  const content = (r.content as { type: string; text?: string }[] | undefined) || [];
  const text = content.filter((c) => c.type === 'text').map((c) => c.text || '').join('\n');
  return { text: text || '(no output)', isError: !!r.isError };
}
