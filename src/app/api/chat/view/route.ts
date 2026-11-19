import { NextRequest, NextResponse } from 'next/server';
import { chatGuard } from '@/lib/chatGuard';
import { readView } from '@/lib/roadnetMcp';
import { effectiveMode } from '@/lib/aiMode';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** The page of one of the extension's views (ui://roadnet/...), shown in a sandboxed frame in the chat. */
export async function GET(request: NextRequest) {
  const token = chatGuard(request, 'chat-view', 60);
  if (typeof token !== 'string') return token;
  const uri = request.nextUrl.searchParams.get('uri') || '';
  if (!/^ui:\/\/roadnet\/[\w.-]+\.html$/.test(uri)) return NextResponse.json({ error: 'Bad view' }, { status: 400 });
  try {
    const page = await readView(token, uri, effectiveMode(request.nextUrl.searchParams.get('mode')) !== 'full');
    return NextResponse.json(page, { headers: { 'Cache-Control': 'private, max-age=3600' } });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'View not available' }, { status: 404 });
  }
}
