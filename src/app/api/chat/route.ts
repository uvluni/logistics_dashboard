import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { chatGuard } from '@/lib/chatGuard';
import { hasClaudeCredentials, runChat, sweepConversations, type ChatEvent } from '@/lib/chatAgent';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** Streams one chat answer as newline-delimited JSON events (see ChatEvent). */
export async function POST(request: NextRequest) {
  const token = chatGuard(request, 'chat', 10);
  if (typeof token !== 'string') return token;
  if (!hasClaudeCredentials()) return NextResponse.json({ error: 'missing_api_key' }, { status: 503 });

  const body = await request.json().catch(() => null);
  const message = typeof body?.message === 'string' ? body.message.trim() : '';
  const conversationId = typeof body?.conversationId === 'string' ? body.conversationId : undefined;
  if (!message || message.length > 4000) return NextResponse.json({ error: 'Message must be 1-4000 characters' }, { status: 400 });

  sweepConversations();
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const emit = (e: ChatEvent) => controller.enqueue(encoder.encode(JSON.stringify(e) + '\n'));
      runChat(token, conversationId, message, emit)
        .catch((err) => {
          let text = 'Something went wrong. Try again.';
          if (err instanceof Anthropic.AuthenticationError) text = 'The Claude API key is missing or invalid.';
          else if (err instanceof Anthropic.RateLimitError) text = 'Claude is busy right now. Try again in a minute.';
          else if (err instanceof Anthropic.APIError) text = `Claude API error ${err.status ?? ''}`.trim();
          else if (err instanceof Error && /session has expired/i.test(err.message)) text = 'The ROADNET session has expired. Log in again.';
          else if (err instanceof Error && process.env.NODE_ENV !== 'production') text = err.message;
          emit({ type: 'error', message: text });
        })
        .finally(() => controller.close());
    },
  });
  return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store' } });
}
