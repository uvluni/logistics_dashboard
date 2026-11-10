import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rateLimiter';
import { sanitizeString } from '@/lib/sanitize';
import { buildCustomerHeat, chunks, daysBetween, MAX_HEAT_DAYS } from '@/lib/customerHeat';

// GET /api/heatmap?from=yyyy-MM-dd&to=yyyy-MM-dd - visits and planned weight per customer location.
export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get('roadnet_token')?.value;
    if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    if (!(await checkRateLimit(token, 30, 60000))) {
      return NextResponse.json({ error: 'Rate limit exceeded. Maximum 30 requests per minute' }, { status: 429 });
    }
    const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
    if (!baseUrl) return NextResponse.json({ error: 'Missing API base URL' }, { status: 500 });

    const { searchParams } = new URL(request.url);
    const from = searchParams.get('from') || '';
    const to = searchParams.get('to') || '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      return NextResponse.json({ error: 'Invalid date format. Use yyyy-MM-dd' }, { status: 400 });
    }
    if (to < from) return NextResponse.json({ error: 'The end date must be on or after the start date' }, { status: 400 });
    if (daysBetween(from, to) > MAX_HEAT_DAYS) return NextResponse.json({ error: `The period is limited to ${MAX_HEAT_DAYS} days` }, { status: 400 });

    const routes: any[] = [];
    for (const [f, t] of chunks(from, to)) {
      const params = new URLSearchParams({ beginDate: `${f}T00:00:00`, endDate: `${t}T23:59:59`, expand: 'All', pageSize: '1000' });
      const res = await fetch(`${baseUrl}/v1/reports/routeactuals?${params}`, {
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      if (res.status === 401) return NextResponse.json({ error: 'Session expired' }, { status: 401 });
      if (!res.ok) return NextResponse.json({ error: `ROADNET error ${res.status}` }, { status: 502 });
      routes.push(...(((await res.json()).items || []) as any[]).filter((r) => r.sessionIdentity?.date >= f && r.sessionIdentity?.date <= t));
    }

    const heat = buildCustomerHeat(routes, from, to);
    heat.customers = heat.customers.map((c) => ({
      ...c,
      id: sanitizeString(c.id, 60),
      name: sanitizeString(c.name, 120),
      city: sanitizeString(c.city, 60),
      routes: c.routes.map((r) => sanitizeString(r, 30)),
    }));
    return NextResponse.json(heat, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Failed to load the heat map' }, { status: 500 });
  }
}
