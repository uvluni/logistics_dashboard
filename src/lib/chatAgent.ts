// The dashboard's chat: Claude with the ROADNET extension's tools, the same instructions the
// extension gives Claude Desktop, streamed to the browser. Conversations live in this server's memory.
import Anthropic from '@anthropic-ai/sdk';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { callToolRaw, mcpFor, reportsDirOf, resultText, sessionKey, type ToolResult } from './roadnetMcp';

const MODEL = process.env.ROADNET_CHAT_MODEL || 'claude-opus-5-5';
// Low AI mode only routes the question to a view: a small, fast model is enough.
const LOW_MODEL = process.env.ROADNET_CHAT_LOW_MODEL || 'claude-haiku-5-5';
const MAX_STEPS = 16; // tool rounds per question
const MAX_TOOL_TEXT = 120_000; // characters of one tool result sent to the model

export type ChatEvent =
  | { type: 'start'; conversationId: string }
  | { type: 'text'; text: string }
  | { type: 'tool'; name: string }
  | { type: 'tool_done'; name: string; ok: boolean }
  /** A tool with a graphical view ran: the browser shows the view with this input and result. */
  | { type: 'view'; tool: string; uri: string; input: Record<string, unknown>; result: ToolResult }
  /** A report file is ready to open (served by /api/chat/file). */
  | { type: 'file'; name: string }
  /** Low AI mode: the answer came from a saved one; the AI was not called. */
  | { type: 'saved' }
  | { type: 'done' }
  | { type: 'error'; message: string };

interface Conversation {
  owner: string;
  /** A conversation stays in one mode: a full-AI history holds data that low mode must not resend. */
  mode: 'full' | 'low';
  messages: Anthropic.Beta.BetaMessageParam[];
  updated: number;
}
const g = globalThis as unknown as { __roadnetChats?: Map<string, Conversation> };
const conversations = (g.__roadnetChats ??= new Map());

// The chat shows the extension's graphical views inline, where their tool ran.
const CHAT_NOTE = `
You are answering inside the ROADNET web dashboard's chat panel, not in Claude Desktop.
- The extension's graphical views ARE shown in this chat, right where their tool ran, the same as in Claude Desktop. Don't repeat their tables; add a short summary with the 2-3 main findings and concrete actions.
- open_report_file shows a link to the file in this chat (the user opens it from there); report files are not opened on anyone's computer.
- Keep answers short and concrete. Markdown: tables, bullets, **bold**; no images.`;

const REPORT_FILE = /^roadnet-[\w-]+\.(html|csv)$/i;

/** open_report_file in the dashboard: instead of opening a window on the server, the chat shows a link. */
function openReportFile(token: string, args: Record<string, unknown>, emit: (e: ChatEvent) => void): ToolResult {
  const name = path.basename(String(args.file || '').trim());
  const fail = (text: string): ToolResult => ({ content: [{ type: 'text', text }], isError: true });
  if (!REPORT_FILE.test(name)) return fail('Only ROADNET report files (HTML or CSV) from the reports folder can be opened.');
  if (!existsSync(path.join(reportsDirOf(token), name))) return fail(`Report file not found: ${name}. Create it first with show_report.`);
  emit({ type: 'file', name });
  return { content: [{ type: 'text', text: JSON.stringify({ opened: name, note: 'A link to the file is shown in the chat.' }) }] };
}

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(Date.now());

let anthropic: Anthropic | null = null;
const client = () => (anthropic ??= new Anthropic());

export function hasClaudeCredentials(): boolean {
  return !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

/** The caller's conversation if it is theirs and in the same mode; otherwise a new one. */
function conversationFor(token: string, conversationId: string | undefined, mode: 'full' | 'low', emit: (e: ChatEvent) => void): Conversation {
  const owner = sessionKey(token);
  const old = conversationId ? conversations.get(conversationId) : undefined;
  let id = old && old.owner === owner && old.mode === mode ? conversationId! : undefined;
  if (!id) {
    id = randomUUID();
    conversations.set(id, { owner, mode, messages: [], updated: Date.now() });
  }
  emit({ type: 'start', conversationId: id });
  return conversations.get(id)!;
}

/** One user question: runs the model and its tool calls until it answers, emitting events as it goes. */
export async function runChat(token: string, conversationId: string | undefined, question: string, emit: (e: ChatEvent) => void, mode: 'full' | 'low' = 'full'): Promise<void> {
  if (mode === 'low') return runLowChat(token, conversationId, question, emit);
  const conv = conversationFor(token, conversationId, 'full', emit);

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
          const input = u.input as Record<string, unknown>;
          const r = u.name === 'open_report_file' ? openReportFile(token, input, emit) : await callToolRaw(token, u.name, input);
          emit({ type: 'tool_done', name: u.name, ok: !r.isError });
          const uri = mcp.views.get(u.name);
          if (uri && !r.isError) emit({ type: 'view', tool: u.name, uri, input, result: r });
          const full = resultText(r);
          const text = full.length > MAX_TOOL_TEXT ? full.slice(0, MAX_TOOL_TEXT) + '\n[result shortened for length]' : full;
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

// ---------------------------------------------------------------------------
// Low AI mode: Claude reads only the question (and earlier questions of this conversation) and picks
// the view(s) to open. The tools server runs blind (RNA_AI_MODE=low), so a tool result is only
// {shown, viewDataId}: nothing from ROADNET can reach the model. One model call per question, no
// second round to "read" results. The view itself fetches its data on this server.
// ---------------------------------------------------------------------------
const LOW_NOTE = `
You are inside the ROADNET web dashboard's chat panel in LOW AI MODE.
- You never see ROADNET data. Open the right view(s) for the request with the right arguments; the view shows the data to the user.
- Before the tool call, write ONE short sentence in the user's language naming the view and the date or period you resolved (e.g. "פותח את תכנון ההפצה ל-2026-11-20."). Nothing after the tool call.
- Never describe, count, summarize or guess data. If the request needs analysis, a written summary, an explanation of causes, an email or a comparison in words, say in one sentence that this needs full AI mode, which is off here, and open the closest view.
- If no view fits (e.g. a general question), answer in one or two sentences without a tool.`;

// Saved intents: the same question (after the same previous question), on the same day and in the same
// language, opens the same views again without calling the AI. Kept in memory for the day.
interface SavedIntent { text: string; calls: { name: string; input: Record<string, unknown> }[]; at: number }
const gi = globalThis as unknown as { __roadnetIntents?: Map<string, SavedIntent> };
const intents: Map<string, SavedIntent> = (gi.__roadnetIntents ??= new Map());
const MAX_INTENTS = 500;
const norm = (s: string) => s.toLowerCase().replace(/[\s?!.,:;"'׳״]+/g, ' ').trim();
const intentKey = (owner: string, previous: string, question: string) =>
  createHash('sha256').update([owner, today(), norm(previous), norm(question)].join('\u0000')).digest('hex');

const lastQuestion = (conv: Conversation): string => {
  for (let i = conv.messages.length - 1; i >= 0; i--) {
    const m = conv.messages[i];
    if (m.role === 'user' && typeof m.content === 'string') return m.content;
  }
  return '';
};

async function runLowChat(token: string, conversationId: string | undefined, question: string, emit: (e: ChatEvent) => void): Promise<void> {
  const conv = conversationFor(token, conversationId, 'low', emit);
  const mcp = await mcpFor(token, true);
  const key = intentKey(conv.owner, lastQuestion(conv), question);
  conv.messages.push({ role: 'user', content: question });
  conv.updated = Date.now();

  // Runs the chosen views (no AI) and returns the tool_result blocks for the conversation history.
  const openViews = async (calls: { id: string; name: string; input: Record<string, unknown> }[]) =>
    Promise.all(
      calls.map(async (c): Promise<Anthropic.Beta.BetaToolResultBlockParam> => {
        emit({ type: 'tool', name: c.name });
        const uri = mcp.views.get(c.name);
        try {
          if (!uri) throw new Error('Only views can be opened in low AI mode.');
          const r = await callToolRaw(token, c.name, c.input, true);
          emit({ type: 'tool_done', name: c.name, ok: !r.isError });
          if (!r.isError) emit({ type: 'view', tool: c.name, uri, input: c.input, result: r });
          else emit({ type: 'text', text: `\n\n${resultText(r).slice(0, 300)}` });
          // The model's history gets only the fact that the view was shown, never its data.
          return { type: 'tool_result', tool_use_id: c.id, is_error: r.isError || undefined, content: r.isError ? 'The view could not be opened.' : 'Shown to the user. (Low AI mode: the data is not sent to you.)' };
        } catch (err) {
          emit({ type: 'tool_done', name: c.name, ok: false });
          return { type: 'tool_result', tool_use_id: c.id, is_error: true, content: err instanceof Error ? err.message : 'failed' };
        }
      })
    );

  const hit = intents.get(key);
  if (hit && hit.at > Date.now() - 24 * 3600_000) {
    emit({ type: 'saved' });
    if (hit.text) emit({ type: 'text', text: hit.text });
    const calls = hit.calls.map((c) => ({ ...c, id: `toolu_saved_${randomUUID().replace(/-/g, '')}` }));
    conv.messages.push({ role: 'assistant', content: [...(hit.text ? [{ type: 'text' as const, text: hit.text }] : []), ...calls.map((c) => ({ type: 'tool_use' as const, id: c.id, name: c.name, input: c.input }))] });
    if (calls.length) conv.messages.push({ role: 'user', content: await openViews(calls) });
    emit({ type: 'done' });
    return;
  }

  const tools: Anthropic.Beta.BetaTool[] = mcp.tools
    .filter((t) => mcp.views.has(t.name))
    .map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema as Anthropic.Beta.BetaTool.InputSchema }));
  const stream = client().beta.messages.stream({
    model: LOW_MODEL,
    max_tokens: 1024,
    system: `${mcp.instructions}\n${LOW_NOTE}\n- Today is ${today()} (Israel time).`,
    tools,
    messages: conv.messages,
    cache_control: { type: 'ephemeral' },
  });
  stream.on('text', (delta) => emit({ type: 'text', text: delta }));
  const message = await stream.finalMessage();
  conv.messages.push({ role: 'assistant', content: message.content as Anthropic.Beta.BetaContentBlockParam[] });

  const uses = message.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use');
  const text = message.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text').map((b) => b.text).join('');
  if (message.stop_reason === 'refusal') emit({ type: 'text', text: '\n\n(Claude declined to answer this request.)' });
  else if (message.stop_reason === 'max_tokens' && uses.length) throw new Error('The answer was cut off (max_tokens).');
  else {
    const calls = uses
      .filter((u) => u.input && typeof u.input === 'object' && !Array.isArray(u.input))
      .map((u) => ({ id: u.id, name: u.name, input: u.input as Record<string, unknown> }));
    if (uses.length) {
      const results = await openViews(calls);
      // A tool call with unparseable input still needs its tool_result in the history.
      for (const u of uses) if (!calls.some((c) => c.id === u.id)) results.push({ type: 'tool_result', tool_use_id: u.id, is_error: true, content: 'Invalid input.' });
      conv.messages.push({ role: 'user', content: results });
    }
    if (calls.length || text) {
      intents.set(key, { text, calls: calls.map(({ name, input }) => ({ name, input })), at: Date.now() });
      if (intents.size > MAX_INTENTS) intents.delete(intents.keys().next().value as string);
    }
  }
  conv.updated = Date.now();
  emit({ type: 'done' });
}

/** Drops conversations idle for a day (they hold tool results in memory). */
export function sweepConversations(maxAgeMs = 24 * 3600_000) {
  for (const [k, c] of conversations) if (Date.now() - c.updated > maxAgeMs) conversations.delete(k);
}
