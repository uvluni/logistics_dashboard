import { NextRequest, NextResponse } from 'next/server';
import { chatGuard } from '@/lib/chatGuard';
import { callToolRaw, viewMayCall } from '@/lib/roadnetMcp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Tool calls made by a view itself (its refresh button, its full data by viewDataId, map points).
 * Only tools that have a view and the extension's view-only tools; all of them are read-only.
 */
export async function POST(request: NextRequest) {
  const token = chatGuard(request, 'chat-tool', 60);
  if (typeof token !== 'string') return token;
  const body = await request.json().catch(() => null);
  const name = typeof body?.name === 'string' ? body.name : '';
  const args = body?.arguments && typeof body.arguments === 'object' && !Array.isArray(body.arguments) ? body.arguments : {};
  if (!name || !(await viewMayCall(token, name))) return NextResponse.json({ error: 'This tool cannot be called from a view' }, { status: 403 });
  try {
    return NextResponse.json(await callToolRaw(token, name, args), { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    const message = err instanceof Error && /session has expired/i.test(err.message) ? 'The ROADNET session has expired. Log in again.' : 'The tool failed.';
    return NextResponse.json({ content: [{ type: 'text', text: message }], isError: true });
  }
}
