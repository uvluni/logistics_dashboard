import type { NextRequest } from 'next/server';

/**
 * Whether auth cookies should carry the Secure flag.
 *
 * Production builds: always. Otherwise: only when the request actually arrived
 * over HTTPS, either directly or through a proxy such as the Cloudflare tunnel,
 * which sets X-Forwarded-Proto. Browsers drop Secure cookies on plain-HTTP
 * pages, so forcing the flag on http://localhost made local login silently fail.
 * This replaces the old FORCE_HTTPS switch.
 */
export function shouldUseSecureCookie(request: NextRequest): boolean {
  if (process.env.NODE_ENV === 'production') return true;
  const forwarded = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim().toLowerCase();
  const proto = forwarded || request.nextUrl.protocol.replace(':', '').toLowerCase();
  return proto === 'https';
}
