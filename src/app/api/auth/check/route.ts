import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// A session is valid only if ROADNET still accepts its token, not merely because the cookie exists.
// Results are kept for a minute so page loads and reloads do not call ROADNET every time.
const CACHE_MS = 60_000;
const g = globalThis as unknown as { __sessionChecks?: Map<string, { at: number; ok: boolean }> };
const checks = (g.__sessionChecks ??= new Map());

async function tokenIsValid(token: string): Promise<boolean> {
  const key = createHash('sha256').update(token).digest('hex');
  const hit = checks.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.ok;
  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (!baseUrl) return false;
  // The smallest authenticated ROADNET call: the vehicle type list.
  const res = await fetch(`${baseUrl}/v1/admin/equipmentType`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, cache: 'no-store' });
  // Only "not authorized" ends the session; a ROADNET outage should not log the user out.
  const ok = res.status !== 401 && res.status !== 403;
  checks.set(key, { at: Date.now(), ok });
  if (checks.size > 500) checks.delete(checks.keys().next().value as string);
  return ok;
}

export async function GET(request: NextRequest) {
  const token = request.cookies.get('roadnet_token')?.value;
  if (!token) return NextResponse.json({ authenticated: false }, { status: 401 });
  let ok: boolean;
  try {
    ok = await tokenIsValid(token);
  } catch {
    ok = true; // ROADNET unreachable: keep the session; data calls will show the error
  }
  if (ok) return NextResponse.json({ authenticated: true }, { headers: { 'Cache-Control': 'no-store' } });
  const res = NextResponse.json({ authenticated: false, expired: true }, { status: 401 });
  res.cookies.delete('roadnet_token');
  return res;
}
