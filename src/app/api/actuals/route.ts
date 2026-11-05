import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rateLimiter';
import { sanitizeDriverName, sanitizeString } from '@/lib/sanitize';
import { compareRouteActuals } from '@/lib/actualsComparison';

// GET /api/actuals?sessionDate=yyyy-MM-dd - plan vs actual for one planning day.
export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get('roadnet_token')?.value;
    if (!token) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    if (!(await checkRateLimit(token, 30, 60000))) {
      return NextResponse.json({ error: 'Rate limit exceeded. Maximum 30 requests per minute' }, { status: 429 });
    }

    const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
    if (!baseUrl) {
      return NextResponse.json({ error: 'Missing API base URL' }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    const sessionDate = searchParams.get('sessionDate') || new Date().toISOString().split('T')[0];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(sessionDate)) {
      return NextResponse.json({ error: 'Invalid sessionDate format. Use yyyy-MM-dd' }, { status: 400 });
    }

    // RNA matches routes whose time span overlaps the window (UTC), so query a
    // wide window and keep only routes from the requested planning session.
    const [y, m, d] = sessionDate.split('-').map(Number);
    const dayBefore = new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
    const params = new URLSearchParams({
      beginDate: `${dayBefore}T00:00:00`,
      endDate: `${sessionDate}T23:59:59`,
      expand: 'All',
      includeProjections: 'true',
      pageSize: '1000',
    });

    const res = await fetch(`${baseUrl}/v1/reports/routeactuals?${params}`, {
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (res.status === 401) {
      return NextResponse.json({ error: 'Session expired' }, { status: 401 });
    }
    if (!res.ok) {
      return NextResponse.json({ error: `ROADNET error ${res.status}` }, { status: 502 });
    }

    const data = await res.json();
    const items = (data.items || []).filter(
      (r: any) => !r.sessionIdentity?.date || r.sessionIdentity.date === sessionDate
    );
    const result = compareRouteActuals(items, sessionDate);
    result.routes = result.routes.map((r) => ({
      ...r,
      routeId: sanitizeString(r.routeId, 50),
      driverName: sanitizeDriverName(r.driverName),
    }));

    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Failed to load route actuals' }, { status: 500 });
  }
}
