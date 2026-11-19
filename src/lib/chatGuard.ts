import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from './rateLimiter';

/**
 * Common checks for the chat endpoints: a logged-in session (roadnet_token cookie), a same-site
 * request, and a per-session rate limit. Returns the session token, or the error response to send.
 */
export function chatGuard(request: NextRequest, bucket: string, perMinute: number): string | NextResponse {
  const token = request.cookies.get('roadnet_token')?.value;
  if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  // The cookie is SameSite=strict; also refuse cross-site requests outright.
  const origin = request.headers.get('origin');
  if (origin && new URL(origin).host !== request.headers.get('host')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (request.headers.get('sec-fetch-site') === 'cross-site') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (!checkRateLimit(`${bucket}:${token}`, perMinute, 60_000)) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  return token;
}
