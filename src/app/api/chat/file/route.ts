import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { chatGuard } from '@/lib/chatGuard';
import { reportsDirOf } from '@/lib/roadnetMcp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * A report file the extension's tools saved for this session (full report, driver plan, POD, CSV).
 * HTML is served sandboxed: its scripts run, but without this site's origin or cookies.
 */
export async function GET(request: NextRequest) {
  const token = chatGuard(request, 'chat-file', 60);
  if (typeof token !== 'string') return token;
  const name = request.nextUrl.searchParams.get('name') || '';
  if (!/^roadnet-[\w-]+\.(html|csv)$/i.test(name)) return NextResponse.json({ error: 'Bad file name' }, { status: 400 });
  const root = path.resolve(reportsDirOf(token));
  const file = path.resolve(root, name);
  if (path.dirname(file) !== root) return NextResponse.json({ error: 'Bad file name' }, { status: 400 });
  const data = await readFile(file).catch(() => null);
  if (!data) return NextResponse.json({ error: 'File not found' }, { status: 404 });
  const csv = name.toLowerCase().endsWith('.csv');
  return new NextResponse(data, {
    headers: {
      'Content-Type': csv ? 'text/csv; charset=utf-8' : 'text/html; charset=utf-8',
      'Content-Disposition': `${csv ? 'attachment' : 'inline'}; filename="${name}"`,
      'Content-Security-Policy': 'sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
    },
  });
}
