// The dashboard's chat: Claude with the ROADNET extension's tools, the same instructions the
// extension gives Claude Desktop, streamed to the browser. Conversations live in this server's memory.
import Anthropic from '@anthropic-ai/sdk';
import { randomUUID } from 'node:crypto';
import { callTool, mcpFor, sessionKey } from './roadnetMcp';

const MODEL = process.env.ROADNET_CHAT_MODEL || 'claude-opus-5-5';
const MAX_STEPS = 16; // tool rounds per question
const MAX_TOOL_TEXT = 120_000; // characters of one tool result sent to the model

export type ChatEvent =
  | { type: 'start'; conversationId: string }
  | { type: 'text'; text: string }
  | { type: 'tool'; name: string }
  | { type: 'tool_done'; name: string; ok: boolean }
  | { type: 'done' }
  | { type: 'error'; message: string };

interface Conversation {
  owner: string;
  messages: Anthropic.Beta.BetaMessageParam[];
  updated: number;
}
const g = globalThis as unknown as { __roadnetChats?: Map<string, Conversation> };
const conversations = (g.__roadnetChats ??= new Map());

// The chat shows text only: the extension's views are not rendered here.
const CHAT_NOTE = `
You are answering inside the ROADNET web dashboard's chat panel, not in Claude Desktop.
- The extension's graphical views are NOT shown here. Tools return a summary (and a viewDataId you must ignore). Present what matters yourself: the key numbers, a short markdown table (at most ~12 rows) or bullets, then the 2-3 main findings and actions.
- Never say "see the view" or "the view shows"; there is none. Files saved to the reports folder are on the dashboard's server; give their names.
- Keep answers short and concrete. Markdown: tables, bullets, **bold**; no images.`;

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(Date.now());

let anthropic: Anthropic | null = null;
const client = () => (anthropic ??= new Anthropic());

export function hasClaudeCredentials(): boolean {
  return !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

/** One user question: runs the model and its tool calls until it answers, emitting events as it goes. */
export async function runChat(token: string, conversationId: string | undefined, question: string, emit: (e: ChatEvent) => void): Promise<void> {
  const owner = sessionKey(token);
  let id = conversationId && conversations.get(conversationId)?.owner === owner ? conversationId : undefined;
  if (!id) {
    id = randomUUID();
    conversations.set(id, { owner, messages: [], updated: Date.now() });
  }
  const conv = conversations.get(id)!;
  emit({ type: 'start', conversationId: id });

  const mcp = await mcpFor(token);
  const tools: Anthropic.Beta.BetaTool[] = mcp.tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema as Anthropic.Beta.BetaTool.InputSchema,
    eager_input_streaming: true,
  }));
  const system = `${mcp.instructions}\n${CHAT_NOTE}\n- Today is ${today()} (Israel time).`;

  conv.messages.push({ role: 'user', content: question });
  conv.updated = Date.now();
  let retries = 0;

  for (let step = 0; step < MAX_STEPS; step++) {
    const stream = client().beta.messages.stream({
      model: MODEL,
      max_tokens: 32000,
      system,
      tools,
      messages: conv.messages,
      cache_control: { type: 'ephemeral' },
      // If a request is declined by a safety classifier, the API re-runs it on a fallback model.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    });
    stream.on('text', (delta) => emit({ type: 'text', text: delta }));

    let message: Anthropic.Beta.BetaMessage;
    try {
      message = await stream.finalMessage();
      retries = 0;
    } catch (err) {
      // An unparseable tool input or a dropped connection is retried; API errors are not.
      if (err instanceof Anthropic.APIError || retries++ >= 2) throw err;
      continue;
    }

    conv.messages.push({ role: 'assistant', content: message.content as Anthropic.Beta.BetaContentBlockParam[] });
    if (message.stop_reason === 'refusal') {
      emit({ type: 'text', text: '\n\n(Claude declined to answer this request.)' });
      break;
    }
    const uses = message.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use');
    // A tool call cut off at max_tokens may parse as a partial object: never run it.
    if (message.stop_reason === 'max_tokens' && uses.length) throw new Error('The answer was cut off (max_tokens).');
    if (message.stop_reason !== 'tool_use' || uses.length === 0) break;

    // All tool results of one turn go back in one user message.
    const results = await Promise.all(
      uses.map(async (u): Promise<Anthropic.Beta.BetaToolResultBlockParam> => {
        emit({ type: 'tool', name: u.name });
        if (!u.input || typeof u.input !== 'object' || Array.isArray(u.input)) {
          emit({ type: 'tool_done', name: u.name, ok: false });
          return { type: 'tool_result', tool_use_id: u.id, is_error: true, content: JSON.stringify({ INVALID_JSON: JSON.stringify(u.input) }) };
        }
        try {
          // The tools server validates the arguments against each tool's schema before running it.
          const r = await callTool(token, u.name, u.input as Record<string, unknown>);
          emit({ type: 'tool_done', name: u.name, ok: !r.isError });
          const text = r.text.length > MAX_TOOL_TEXT ? r.text.slice(0, MAX_TOOL_TEXT) + '\n[result shortened for length]' : r.text;
          return { type: 'tool_result', tool_use_id: u.id, is_error: r.isError || undefined, content: text };
        } catch (err) {
          emit({ type: 'tool_done', name: u.name, ok: false });
          return { type: 'tool_result', tool_use_id: u.id, is_error: true, content: err instanceof Error ? err.message : String(err) };
        }
      })
    );
    conv.messages.push({ role: 'user', content: results });
  }
  conv.updated = Date.now();
  emit({ type: 'done' });
}

/** Drops conversations idle for a day (they hold tool results in memory). */
export function sweepConversations(maxAgeMs = 24 * 3600_000) {
  for (const [k, c] of conversations) if (Date.now() - c.updated > maxAgeMs) conversations.delete(k);
}
