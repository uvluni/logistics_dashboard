import { NextRequest, NextResponse } from 'next/server';
import { chatGuard } from '@/lib/chatGuard';
import { maxAiMode } from '@/lib/aiMode';
import { hasClaudeCredentials } from '@/lib/chatAgent';
import { viewTools } from '@/lib/roadnetMcp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * What the chat panel may offer: the most AI this installation allows, whether a Claude key is set,
 * and the views that can be opened without AI (name, view page, arguments).
 */
export async function GET(request: NextRequest) {
  const token = chatGuard(request, 'chat-config', 30);
  if (typeof token !== 'string') return token;
  const max = maxAiMode();
  try {
    // The blind tools server: the same views, and what the no-AI menu opens.
    const views = await viewTools(token, max !== 'full');
    return NextResponse.json({ max, hasKey: hasClaudeCredentials(), views }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return NextResponse.json({ max, hasKey: hasClaudeCredentials(), views: [], error: err instanceof Error ? err.message : 'Views not available' });
  }
}
